import { describe, expect, it } from 'vitest';
import {
  joinCaptionPages,
  normalizeCaptionText,
  paginateCaptionText,
  readingDurationMs,
} from '../src/shared/caption-layout';

describe('caption layout', () => {
  it.each([
    'Une phrase française avec des accents, des nombres 1 234 et une conclusion claire.',
    '日本語の長い文章でも文字を失わずにページを分割します。',
    'Emoji families 👨‍👩‍👧‍👦 and flags 🇫🇷 stay on grapheme boundaries.',
    `A-${'x'.repeat(180)}-token-without-spaces`,
  ])('paginates without losing or duplicating text: %s', (input) => {
    const pages = paginateCaptionText(input, (candidate) => [...candidate].length <= 24, 'fr');
    expect(pages.length).toBeGreaterThan(1);
    expect(joinCaptionPages(pages)).toBe(normalizeCaptionText(input));
    expect(pages.every((page) => page.length > 0)).toBe(true);
  });

  it('uses bounded reading durations', () => {
    expect(readingDurationMs('court')).toBe(1600);
    expect(readingDurationMs('x'.repeat(300))).toBe(4500);
  });
});
