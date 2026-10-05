import { describe, expect, it } from 'vitest';
import { DECIDE, read, type Reading, type Way } from '../recognize.ts';

const all = () => true;
const start: Reading = { kind: 'undecided' };

// Reads a finger moving through `points`, as the moves arrive.
const follow = (
  points: ReadonlyArray<readonly [number, number]>,
  works: (way: Way) => boolean = all,
) =>
  points.reduce<Reading>(
    (before, [dx, dy]) => read(before, dx, dy, works),
    start,
  );

describe('the Thumb Lock reading the moving finger', () => {
  it('waits until the finger has gone far enough to have a way', () => {
    expect(follow([[0, DECIDE - 1]])).toEqual({ kind: 'undecided' });
    expect(follow([[0, DECIDE]])).toMatchObject({ kind: 'going', way: 'down' });
  });

  it('keeps its way however far the finger goes', () => {
    expect(
      follow([
        [-20, 0],
        [-200, 10],
      ]),
    ).toEqual({ kind: 'going', way: 'left' });
  });

  it('keeps its way as the finger wanders, until it comes back to the start', () => {
    expect(
      follow([
        [0, 20],
        [30, 40],
      ]),
    ).toMatchObject({ way: 'down' });
    expect(
      follow([
        [0, 20],
        [0, 2],
        [-20, 0],
      ]),
    ).toMatchObject({ way: 'left' });
  });

  it('is Wrong toward a way that does not work here, until it comes back', () => {
    const works = (way: Way) => way !== 'left';
    expect(
      follow(
        [
          [-30, 0],
          [-120, 0],
        ],
        works,
      ),
    ).toEqual({ kind: 'wrong', way: 'left' });
    expect(
      follow(
        [
          [-30, 0],
          [0, 0],
          [0, 30],
        ],
        works,
      ),
    ).toMatchObject({
      kind: 'going',
      way: 'down',
    });
  });
});
