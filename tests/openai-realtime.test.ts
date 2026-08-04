import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTranslationClientSecret,
  OpenAIRequestError,
  safetyIdentifier,
} from '../src/main/openai-realtime';

describe('OpenAI realtime client secrets', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses a stable privacy-preserving installation identifier', () => {
    expect(safetyIdentifier('installation')).toMatch(/^[a-f0-9]{64}$/);
    expect(safetyIdentifier('installation')).toBe(safetyIdentifier('installation'));
  });

  it('creates a translation secret without returning the standard key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ value: 'ephemeral', expires_at: 123 }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createTranslationClientSecret('sk-project-standard-secret', 'fr', 'install-id'),
    ).resolves.toEqual({ value: 'ephemeral', expiresAt: 123 });

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      session: {
        model: 'gpt-realtime-translate',
        audio: { output: { language: 'fr' } },
      },
    });
  });

  it.each([
    [401, 'invalid_key'],
    [402, 'billing_required'],
    [404, 'model_unavailable'],
    [429, 'rate_limited'],
  ] as const)('maps HTTP %i to %s', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
    await expect(
      createTranslationClientSecret('sk-project-standard-secret', 'fr', 'install-id'),
    ).rejects.toEqual(new OpenAIRequestError(code));
  });
});
