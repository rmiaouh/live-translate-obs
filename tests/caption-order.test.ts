import { describe, expect, it } from 'vitest';
import { orderCaptionCards } from '../src/shared/caption-order';
import type { CaptionState } from '../src/shared/contracts';

function caption(source: CaptionState['source'], sequence: number): CaptionState {
  return {
    source,
    utteranceId: `${source}-${sequence}`,
    revision: 1,
    isFinal: false,
    text: `${source} ${sequence}`,
    sequence,
    receivedAt: sequence,
    expiresAt: sequence + 1_000,
    visible: true,
  };
}

describe('caption card ordering', () => {
  it('keeps host above guests regardless of who spoke most recently', () => {
    expect(orderCaptionCards([caption('guest', 1), caption('host', 2)]).map(({ source }) => source))
      .toEqual(['host', 'guest']);
    expect(orderCaptionCards([caption('host', 3), caption('guest', 4)]).map(({ source }) => source))
      .toEqual(['host', 'guest']);
  });

  it('keeps only the newest cards before assigning their stable lanes', () => {
    expect(orderCaptionCards([
      caption('mixed', 1),
      caption('guest', 2),
      caption('host', 3),
    ]).map(({ source }) => source)).toEqual(['host', 'guest']);
  });
});
