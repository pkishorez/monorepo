import { describe, expect, it } from 'vitest';
import { indexAt, offsetsOf, rangeOf } from '../rows.ts';

const tens = offsetsOf(100, () => 10);

describe('offsetsOf', () => {
  it('adds up the heights, measured or guessed', () => {
    expect([...offsetsOf(3, (index) => [20, 40, 10][index]!)]).toEqual([
      0, 20, 60, 70,
    ]);
    expect([...offsetsOf(0, () => 10)]).toEqual([0]);
  });
});

describe('indexAt', () => {
  it('is the row a px falls in', () => {
    expect(indexAt(tens, 0)).toBe(0);
    expect(indexAt(tens, 9)).toBe(0);
    expect(indexAt(tens, 10)).toBe(1);
    expect(indexAt(tens, 555)).toBe(55);
  });

  it('stays within the list', () => {
    expect(indexAt(tens, -40)).toBe(0);
    expect(indexAt(tens, 5000)).toBe(99);
    expect(
      indexAt(
        offsetsOf(0, () => 10),
        50,
      ),
    ).toBe(0);
  });
});

describe('rangeOf', () => {
  it('is the rows in view and the overscan either side', () => {
    expect(rangeOf(tens, 200, 300, 0)).toEqual({ start: 20, end: 31 });
    expect(rangeOf(tens, 200, 300, 50)).toEqual({ start: 15, end: 36 });
  });

  it('stops at the ends of the list', () => {
    expect(rangeOf(tens, -100, 40, 20)).toEqual({ start: 0, end: 7 });
    expect(rangeOf(tens, 950, 1200, 20)).toEqual({ start: 93, end: 100 });
  });

  it('draws nothing for a view nowhere near the list', () => {
    expect(rangeOf(tens, 3000, 3500, 100)).toEqual({ start: 0, end: 0 });
    expect(rangeOf(tens, -900, -500, 100)).toEqual({ start: 0, end: 0 });
  });
});
