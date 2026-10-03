import type { Word } from '../transcript/index.ts';

/**
 * Whisper's word starts are trustworthy; its ends are not. The model runs
 * on a window padded to thirty seconds and lets a word's end drift across
 * the silence, the padding, and even the next word. Words that start at or
 * past the window end were heard in the padding and are dropped. Each end is
 * pulled back to the earliest of: the next word's start, the window end, and
 * a longest plausible word.
 */
export const tameWordEnds = (
  words: ReadonlyArray<Word>,
  options: { readonly windowEnd: number; readonly maxWordSeconds: number },
): Array<Word> => {
  const sorted = words
    .filter((word) => word.start < options.windowEnd)
    .sort((a, b) => a.start - b.start);
  return sorted.map((word, index) => {
    const next = sorted[index + 1];
    const end = Math.min(
      word.end,
      next ? next.start : Number.POSITIVE_INFINITY,
      options.windowEnd,
      word.start + options.maxWordSeconds,
    );
    return { ...word, end: Math.max(end, word.start + 0.05) };
  });
};
