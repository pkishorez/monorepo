import type { Range } from '../../library/index.ts';

/** Seconds a clip shows before a cut, and after it. */
export const LEAD_IN = 2;
export const LEAD_OUT = 1.5;

/** A cut longer than this shows only its first HEAD and last TAIL seconds. */
export const LONG_CUT = 30;
export const HEAD = 20;
export const TAIL = 5;

/** What a clip of one cut shows: the ranges of the original it joins, and where the cut is in the clip. */
export interface ClipPlan {
  /** Seconds of the original, joined in order. */
  readonly ranges: ReadonlyArray<Range>;
  /** Seconds of the clip that the cut removed. */
  readonly removed: ReadonlyArray<Range>;
}

/**
 * The clip of the cut `cut` in an original of `duration` seconds: from
 * LEAD_IN before it to LEAD_OUT after it, within the video. A cut over
 * LONG_CUT shows its first HEAD and its last TAIL seconds, the two joined,
 * so a four-minute intro previews in half a minute.
 */
export const clipPlan = (cut: Range, duration: number): ClipPlan => {
  const start = Math.max(0, Math.min(cut.start, duration));
  const end = Math.max(start, Math.min(cut.end, duration));
  const from = Math.max(0, start - LEAD_IN);
  const to = Math.min(duration, end + LEAD_OUT);
  if (end - start <= LONG_CUT)
    return {
      ranges: [{ start: from, end: to }],
      removed: [{ start: start - from, end: end - from }],
    };
  const head = { start: from, end: start + HEAD };
  const tail = { start: end - TAIL, end: to };
  const joint = head.end - head.start;
  return {
    ranges: [head, tail],
    removed: [
      { start: start - from, end: joint },
      { start: joint, end: joint + TAIL },
    ],
  };
};
