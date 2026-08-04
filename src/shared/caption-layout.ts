const FALLBACK_WORD_BOUNDARY = /\s+/gu;

export const CAPTION_READING_CHARACTERS_PER_SECOND = 15;
export const CAPTION_PAGE_MIN_MS = 1_600;
export const CAPTION_PAGE_MAX_MS = 4_500;
export const CAPTION_CATCHUP_MIN_MS = 900;

export function normalizeCaptionText(value: string): string {
  return value.replace(/[\s\u00a0]+/gu, ' ').trim();
}

export function readingDurationMs(text: string): number {
  const duration = (normalizeCaptionText(text).length / CAPTION_READING_CHARACTERS_PER_SECOND) * 1_000;
  return Math.round(Math.min(CAPTION_PAGE_MAX_MS, Math.max(CAPTION_PAGE_MIN_MS, duration)));
}

/**
 * Splits text with a caller-provided visual fit test. Pages are cut on word
 * boundaries first, then on Unicode grapheme boundaries when a single token is
 * wider than the available caption box.
 */
export function paginateCaptionText(
  value: string,
  fits: (candidate: string) => boolean,
  locale?: string,
): string[] {
  let remaining = normalizeCaptionText(value);
  if (!remaining) return [];

  const pages: string[] = [];
  let guard = 0;
  while (remaining && guard < 4_096) {
    guard += 1;
    if (fits(remaining)) {
      pages.push(remaining);
      break;
    }

    const wordBoundary = largestFittingBoundary(remaining, wordBoundaries(remaining, locale), fits);
    const boundary = wordBoundary > 0
      ? wordBoundary
      : largestFittingBoundary(remaining, graphemeBoundaries(remaining, locale), fits);

    // A renderer with zero measurable width must still make progress.
    const safeBoundary = boundary > 0 ? boundary : firstGraphemeBoundary(remaining, locale);
    const page = remaining.slice(0, safeBoundary);
    if (!page.trim()) break;
    pages.push(page);
    remaining = remaining.slice(safeBoundary);
  }

  if (remaining && pages.at(-1) !== remaining) pages.push(remaining);
  return pages;
}

export function joinCaptionPages(pages: string[]): string {
  return normalizeCaptionText(pages.join(''));
}

function largestFittingBoundary(
  text: string,
  boundaries: number[],
  fits: (candidate: string) => boolean,
): number {
  const candidates = boundaries.filter((boundary) => boundary > 0 && boundary < text.length);
  let low = 0;
  let high = candidates.length - 1;
  let best = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const boundary = candidates[middle];
    const candidate = text.slice(0, boundary).trimEnd();
    if (candidate && fits(candidate)) {
      best = boundary;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

function wordBoundaries(text: string, locale?: string): number[] {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(locale, { granularity: 'word' });
    return [...segmenter.segment(text)].map(({ index, segment }) => index + segment.length);
  }

  const boundaries: number[] = [];
  for (const match of text.matchAll(FALLBACK_WORD_BOUNDARY)) boundaries.push(match.index + match[0].length);
  return boundaries;
}

function graphemeBoundaries(text: string, locale?: string): number[] {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(locale, { granularity: 'grapheme' });
    return [...segmenter.segment(text)].map(({ index, segment }) => index + segment.length);
  }

  const boundaries: number[] = [];
  let offset = 0;
  for (const character of text) {
    offset += character.length;
    boundaries.push(offset);
  }
  return boundaries;
}

function firstGraphemeBoundary(text: string, locale?: string): number {
  return graphemeBoundaries(text, locale)[0] ?? Math.min(1, text.length);
}
