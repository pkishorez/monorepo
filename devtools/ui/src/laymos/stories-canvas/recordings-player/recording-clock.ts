import type { Frame, Recording, Step } from 'laymos/story/schema';

export interface ClockRange {
  readonly start: number;
  readonly end: number;
}

/** The span of the Story clock the Recordings and Steps cover. */
export function clockRange(
  recordings: readonly Recording[],
  steps: readonly Step[],
): ClockRange {
  const starts = [
    ...recordings.map((recording) => recording.openedAt),
    ...recordings.flatMap((recording) =>
      recording.frames.slice(0, 1).map((frame) => frame.at),
    ),
    ...steps.map((step) => step.startedAt),
  ];
  const ends = [
    ...recordings.map((recording) => recording.closedAt),
    ...recordings.flatMap((recording) =>
      recording.frames.slice(-1).map((frame) => frame.at),
    ),
    ...steps.map((step) => step.endedAt),
  ];
  if (starts.length === 0) return { start: 0, end: 0 };
  const start = Math.min(...starts);
  return { start, end: Math.max(start, ...ends) };
}

/**
 * The index of the frame on screen at `time`: the last one that appeared at
 * or before it, or -1 before the first. Frames are in order of `at`.
 */
export function frameAt(frames: readonly Frame[], time: number): number {
  let low = 0;
  let high = frames.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (frames[middle]!.at <= time) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/** The Step under way at `time`, else the last one begun before it. */
export function stepAt(steps: readonly Step[], time: number): Step | undefined {
  let latest: Step | undefined;
  for (const step of steps) {
    if (step.startedAt > time) continue;
    if (time <= step.endedAt) return step;
    if (latest === undefined || step.startedAt >= latest.startedAt)
      latest = step;
  }
  return latest;
}
