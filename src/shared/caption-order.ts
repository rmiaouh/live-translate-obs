import type { CaptionState } from './contracts';

const SOURCE_POSITION: Record<CaptionState['source'], number> = {
  host: 0,
  guest: 1,
  mixed: 2,
};

/**
 * Keeps speaker cards in fixed visual lanes. Sequence is used only to retain
 * the newest cards if stale captions from another mode overlap briefly.
 */
export function orderCaptionCards(captions: CaptionState[], limit = 2): CaptionState[] {
  return [...captions]
    .sort((left, right) => right.sequence - left.sequence)
    .slice(0, limit)
    .sort((left, right) =>
      SOURCE_POSITION[left.source] - SOURCE_POSITION[right.source]
      || left.sequence - right.sequence,
    );
}
