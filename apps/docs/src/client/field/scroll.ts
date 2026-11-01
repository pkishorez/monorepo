import type { Chapter } from './chapters.ts';

/*
 * Where the reader is, as one number: the Chapter whose middle is nearest
 * the line being read, `focus` pixels down the screen, and how far on
 * towards the next. 2.5 is halfway from the third Chapter to the fourth.
 * The page opens on its first Chapter: when that Chapter's middle is
 * already above the line at the top of the page, as a tall opening's is
 * on a phone, the first scroll is where the way to the next one starts.
 */

export function progress(
  chapters: readonly Chapter[],
  scrollY: number,
  focus: number,
): number {
  const middle = scrollY + focus;
  const last = chapters.length - 1;
  const first = Math.max(chapters[0]?.middle ?? 0, focus);
  if (last <= 0 || middle <= first) return 0;
  for (let k = 0; k < last; k++) {
    const from = k === 0 ? first : chapters[k]!.middle;
    const to = chapters[k + 1]!.middle;
    if (middle < to) return k + (middle - from) / Math.max(to - from, 1);
  }
  return last;
}

/** The share of the way, at each end, where a shape holds still. */
const HOLD = 0.07;

/**
 * How far a morph has gone, `f` of the way from one Chapter to the next.
 * A shape holds only briefly, while its words sit on the line being read;
 * the rest of the way it moves with the scroll, nearly evenly, eased only
 * at its ends, so the scroll and the shape never come apart.
 */
export function blendOf(f: number): number {
  const x = Math.min(Math.max((f - HOLD) / (1 - 2 * HOLD), 0), 1);
  return 0.5 * x + 0.5 * x * x * (3 - 2 * x);
}
