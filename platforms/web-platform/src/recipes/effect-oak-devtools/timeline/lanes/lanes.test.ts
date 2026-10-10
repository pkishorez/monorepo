import { describe, expect, it } from 'vitest';
import type { Entry } from 'effect-oak';
import { lanesOf } from './lanes.ts';

const entry = (id: number, parent: number | null) =>
  ({ id, parent }) as unknown as Entry;

const laneById = (all: ReadonlyArray<Entry>) =>
  Object.fromEntries(
    lanesOf(all).rows.map((row) => [
      row.step === 'init' ? 'init' : row.step.id,
      row.lane,
    ]),
  );

describe('the Timeline lanes', () => {
  it('keeps every Branch in the lane it was born in', () => {
    // 0 → 1 → 2, then a fork from 0: 3 → 4, then another from 1: 5.
    const first = [entry(0, null), entry(1, 0), entry(2, 1)];
    const forked = [...first, entry(3, 0), entry(4, 3)];
    const again = [...forked, entry(5, 1)];

    expect(laneById(first)).toEqual({ 0: 0, 1: 0, 2: 0, init: 0 });
    expect(laneById(forked)).toMatchObject({ 0: 0, 1: 0, 2: 0, 3: 1, 4: 1 });
    expect(laneById(again)).toMatchObject({ 2: 0, 4: 1, 5: 2 });
    expect(lanesOf(again).width).toBe(3);
  });
});
