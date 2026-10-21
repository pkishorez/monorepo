import type { Chapter } from './chapters.ts';

/*
 * Where the reader is, as one number: the Chapter whose middle is nearest
 * the middle of the screen, and how far on towards the next. 2.5 is halfway
 * from the third Chapter to the fourth.
 */

export function progress(
  chapters: readonly Chapter[],
  scrollY: number,
  viewHeight: number,
): number {
  const middle = scrollY + viewHeight / 2;
  const last = chapters.length - 1;
  if (last <= 0 || middle <= chapters[0]!.middle) return 0;
  for (let k = 0; k < last; k++) {
    const from = chapters[k]!.middle;
    const to = chapters[k + 1]!.middle;
    if (middle < to) return k + (middle - from) / Math.max(to - from, 1);
  }
  return last;
}

/**
 * How far a morph has gone, `f` of the way from one Chapter to the next:
 * held formed near each, moving through the middle of the way.
 */
export function blendOf(f: number): number {
  const x = Math.min(Math.max((f - 0.22) / 0.56, 0), 1);
  // Quintic: starts and lands softer than a cubic, with a surer middle.
  return x * x * x * (x * (6 * x - 15) + 10);
}
