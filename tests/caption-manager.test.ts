import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptionManager } from '../src/main/caption-manager';
import { OverlayConfigSchema, type OverlayMessage } from '../src/shared/contracts';

describe('CaptionManager', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('aggregates deltas per source and broadcasts full state', () => {
    const messages: OverlayMessage[] = [];
    const manager = new CaptionManager(OverlayConfigSchema.parse({}), (message) => messages.push(message));

    manager.append({ source: 'host', label: 'Présentateur', delta: 'Bonjour' }, 1000);
    const caption = manager.append({ source: 'host', delta: ' à tous' }, 1200);

    expect(caption.text).toBe('Bonjour à tous');
    expect(caption.label).toBe('Présentateur');
    expect(caption.sequence).toBe(2);
    expect(messages.at(-1)).toEqual({ type: 'caption.delta', caption });
  });

  it('keeps split sources independent', () => {
    const manager = new CaptionManager(OverlayConfigSchema.parse({}), () => undefined);
    manager.append({ source: 'host', delta: 'Hôte' });
    manager.append({ source: 'guest', delta: 'Invité' });

    expect(manager.snapshot().map(({ source }) => source).sort()).toEqual(['guest', 'host']);
  });

  it('fades and clears after the configured display duration', async () => {
    const messages: OverlayMessage[] = [];
    const manager = new CaptionManager(
      OverlayConfigSchema.parse({ displayDurationMs: 2000 }),
      (message) => messages.push(message),
    );
    manager.append({ source: 'mixed', delta: 'Texte' });

    await vi.advanceTimersByTimeAsync(2400);
    expect(messages.at(-1)).toMatchObject({
      type: 'caption.delta',
      caption: { visible: false },
    });

    await vi.advanceTimersByTimeAsync(250);
    expect(messages.at(-1)).toEqual({ type: 'caption.clear', source: 'mixed' });
    expect(manager.snapshot()).toHaveLength(0);
  });

  it('hard-splits at 4096 characters without losing the beginning', () => {
    const messages: OverlayMessage[] = [];
    const manager = new CaptionManager(OverlayConfigSchema.parse({}), (message) => messages.push(message));
    const input = `start ${'mot '.repeat(1_100)}`.trim();
    const caption = manager.append({ source: 'mixed', delta: input });
    const completed = messages.find((message) => message.type === 'caption.delta' && message.caption.isFinal);
    expect(completed?.type).toBe('caption.delta');
    if (completed?.type !== 'caption.delta') throw new Error('final split missing');
    expect(completed.caption.text.length).toBeLessThanOrEqual(4096);
    expect(caption.text.length).toBeLessThanOrEqual(4096);
    expect(`${completed.caption.text} ${caption.text}`.replace(/\s+/gu, ' ').trim()).toBe(input.replace(/\s+/gu, ' '));
  });

  it('starts a fresh caption after 1.2 seconds of inactivity', async () => {
    const manager = new CaptionManager(OverlayConfigSchema.parse({}), () => undefined);
    manager.append({ source: 'mixed', delta: 'Première phrase' });
    await vi.advanceTimersByTimeAsync(1200);
    const next = manager.append({ source: 'mixed', delta: 'Nouvelle phrase' });
    expect(next.text).toBe('Nouvelle phrase');
    expect(next.revision).toBe(1);
  });

  it('finalizes punctuation quickly and uses a global sequence across speakers', async () => {
    const messages: OverlayMessage[] = [];
    const manager = new CaptionManager(OverlayConfigSchema.parse({}), (message) => messages.push(message));
    const host = manager.append({ source: 'host', delta: 'Hello.' });
    const guest = manager.append({ source: 'guest', delta: 'Bonjour.' });
    expect(guest.sequence).toBeGreaterThan(host.sequence);
    await vi.advanceTimersByTimeAsync(250);
    const finalized = messages.filter((message) => message.type === 'caption.delta' && message.caption.isFinal);
    expect(finalized).toHaveLength(2);
  });
});
