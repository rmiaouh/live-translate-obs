import { randomUUID } from 'node:crypto';
import type {
  CaptionDeltaInput,
  CaptionSource,
  CaptionState,
  OverlayConfig,
  OverlayMessage,
} from '../shared/contracts';
import { CAPTION_READING_CHARACTERS_PER_SECOND } from '../shared/caption-layout';

export const MAX_UTTERANCE_CHARACTERS = 4_096;
const MAX_EXTRA_READING_TIME_MS = 60_000;
const FADE_DURATION_MS = 250;
const INACTIVITY_SETTLE_MS = 1_200;
const PUNCTUATION_SETTLE_MS = 250;

export class CaptionManager {
  private readonly captions = new Map<CaptionSource, CaptionState>();
  private readonly timers = new Map<CaptionSource, NodeJS.Timeout>();
  private readonly settleTimers = new Map<CaptionSource, NodeJS.Timeout>();
  private globalSequence = 0;

  constructor(
    private config: OverlayConfig,
    private readonly emit: (message: OverlayMessage) => void,
  ) {}

  append(input: CaptionDeltaInput, now = Date.now()): CaptionState {
    const delta = sanitizeDelta(input.delta);
    const previous = this.captions.get(input.source);
    const continuing = previous && !previous.isFinal;
    const combined = `${continuing ? previous.text : ''}${delta}`;

    let text = combined;
    if (combined.length > MAX_UTTERANCE_CHARACTERS) {
      const boundary = safeBoundary(combined, MAX_UTTERANCE_CHARACTERS);
      const completed = this.createCaption({
        source: input.source,
        label: input.label ?? previous?.label,
        text: combined.slice(0, boundary).trimEnd(),
        utteranceId: continuing ? previous.utteranceId : randomUUID(),
        revision: continuing ? previous.revision + 1 : 1,
        isFinal: true,
        now,
      });
      this.captions.set(input.source, completed);
      this.emit({ type: 'caption.delta', caption: completed });
      text = combined.slice(boundary).trimStart();
    }

    const startsAfterHardSplit = combined.length > MAX_UTTERANCE_CHARACTERS;
    const caption = this.createCaption({
      source: input.source,
      label: input.label ?? previous?.label,
      text,
      utteranceId: continuing && !startsAfterHardSplit ? previous.utteranceId : randomUUID(),
      revision: continuing && !startsAfterHardSplit ? previous.revision + 1 : 1,
      isFinal: false,
      now,
    });

    this.captions.set(input.source, caption);
    this.scheduleSettle(input.source, caption);
    this.scheduleClear(input.source, caption);
    this.emit({ type: 'caption.delta', caption });
    return cloneCaption(caption);
  }

  clear(source?: CaptionSource): void {
    const sources = source ? [source] : [...this.captions.keys()];
    for (const currentSource of sources) {
      this.cancelTimers(currentSource);
      if (this.captions.delete(currentSource)) {
        this.emit({ type: 'caption.clear', source: currentSource });
      }
    }
  }

  updateConfig(config: OverlayConfig): void {
    this.config = config;
    for (const caption of this.captions.values()) this.scheduleClear(caption.source, caption);
    this.emit({ type: 'overlay.config', config });
  }

  snapshot(): CaptionState[] {
    return [...this.captions.values()].map(cloneCaption);
  }

  snapshotMessage(): OverlayMessage {
    return { type: 'overlay.snapshot', captions: this.snapshot(), config: this.config };
  }

  private createCaption(input: {
    source: CaptionSource;
    label?: string;
    text: string;
    utteranceId: string;
    revision: number;
    isFinal: boolean;
    now: number;
  }): CaptionState {
    const lifetime = captionLifetimeMs(input.text, this.config.displayDurationMs);
    return {
      source: input.source,
      label: input.label,
      utteranceId: input.utteranceId,
      revision: input.revision,
      isFinal: input.isFinal,
      text: input.text,
      sequence: ++this.globalSequence,
      receivedAt: input.now,
      expiresAt: input.now + lifetime,
      visible: true,
    };
  }

  private finalize(source: CaptionSource): void {
    const current = this.captions.get(source);
    if (!current || current.isFinal) return;
    const caption: CaptionState = {
      ...current,
      isFinal: true,
      revision: current.revision + 1,
      sequence: ++this.globalSequence,
    };
    this.captions.set(source, caption);
    this.emit({ type: 'caption.delta', caption });
  }

  private scheduleClear(source: CaptionSource, caption: CaptionState): void {
    const previous = this.timers.get(source);
    if (previous) clearTimeout(previous);
    const delay = captionLifetimeMs(caption.text, this.config.displayDurationMs);
    const fadeTimer = setTimeout(() => {
      const current = this.captions.get(source);
      if (!current || current.utteranceId !== caption.utteranceId) return;
      const hidden: CaptionState = {
        ...current,
        visible: false,
        revision: current.revision + 1,
      };
      this.captions.set(source, hidden);
      this.emit({ type: 'caption.delta', caption: hidden });
      const clearTimer = setTimeout(() => {
        this.timers.delete(source);
        if (this.captions.get(source)?.utteranceId !== caption.utteranceId) return;
        this.captions.delete(source);
        this.emit({ type: 'caption.clear', source });
      }, FADE_DURATION_MS);
      this.timers.set(source, clearTimer);
    }, delay);
    this.timers.set(source, fadeTimer);
  }

  private scheduleSettle(source: CaptionSource, caption: CaptionState): void {
    const previous = this.settleTimers.get(source);
    if (previous) clearTimeout(previous);
    const delay = /[.!?…][\]})"']?\s*$/u.test(caption.text)
      ? PUNCTUATION_SETTLE_MS
      : INACTIVITY_SETTLE_MS;
    this.settleTimers.set(
      source,
      setTimeout(() => {
        this.settleTimers.delete(source);
        if (this.captions.get(source)?.utteranceId === caption.utteranceId) this.finalize(source);
      }, delay),
    );
  }

  private cancelTimers(source: CaptionSource): void {
    const timer = this.timers.get(source);
    if (timer) clearTimeout(timer);
    const settleTimer = this.settleTimers.get(source);
    if (settleTimer) clearTimeout(settleTimer);
    this.timers.delete(source);
    this.settleTimers.delete(source);
  }
}

function sanitizeDelta(delta: string): string {
  return [...delta]
    .map((character) => {
      const code = character.charCodeAt(0);
      const forbiddenControl = (code >= 0 && code <= 8)
        || (code >= 11 && code <= 12)
        || (code >= 14 && code <= 31)
        || code === 127;
      return forbiddenControl ? ' ' : character;
    })
    .join('');
}

function safeBoundary(value: string, limit: number): number {
  const head = value.slice(0, limit + 1);
  const whitespace = Math.max(head.lastIndexOf(' '), head.lastIndexOf('\n'), head.lastIndexOf('\t'));
  if (whitespace >= Math.floor(limit * 0.75)) return whitespace + 1;

  if (typeof Intl.Segmenter === 'function') {
    const boundaries = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(head)]
      .map(({ index, segment }) => index + segment.length)
      .filter((boundary) => boundary <= limit);
    return boundaries.at(-1) ?? limit;
  }
  return limit;
}

function captionLifetimeMs(text: string, displayDurationMs: number): number {
  const readingTime = Math.min(
    MAX_EXTRA_READING_TIME_MS,
    Math.ceil((text.length / CAPTION_READING_CHARACTERS_PER_SECOND) * 1_000),
  );
  return displayDurationMs + readingTime;
}

function cloneCaption(caption: CaptionState): CaptionState {
  return { ...caption };
}
