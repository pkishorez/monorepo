import { describe, expect, it } from 'vitest';
import { clipPlan } from '../clip.ts';

describe('clipPlan', () => {
  it('shows 2 s before a cut and 1.5 s after it', () => {
    expect(clipPlan({ start: 10, end: 10.5 }, 60)).toEqual({
      ranges: [{ start: 8, end: 12 }],
      removed: [{ start: 2, end: 2.5 }],
    });
  });

  it('stops at the start and the end of the video', () => {
    expect(clipPlan({ start: 0.5, end: 1 }, 60)).toEqual({
      ranges: [{ start: 0, end: 2.5 }],
      removed: [{ start: 0.5, end: 1 }],
    });
    expect(clipPlan({ start: 58, end: 60 }, 60)).toEqual({
      ranges: [{ start: 56, end: 60 }],
      removed: [{ start: 2, end: 4 }],
    });
  });

  it('shows a cut over 30 s by its first 20 s and its last 5 s, joined', () => {
    expect(clipPlan({ start: 0, end: 232.4 }, 2618)).toEqual({
      ranges: [
        { start: 0, end: 20 },
        { start: 227.4, end: 233.9 },
      ],
      removed: [
        { start: 0, end: 20 },
        { start: 20, end: 25 },
      ],
    });
    expect(clipPlan({ start: 100, end: 140 }, 2618).removed).toEqual([
      { start: 2, end: 22 },
      { start: 22, end: 27 },
    ]);
  });
});
