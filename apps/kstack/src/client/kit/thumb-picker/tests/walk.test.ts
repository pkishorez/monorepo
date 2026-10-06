import { describe, expect, it } from 'vitest';
import { STEP } from '../steps.ts';
import type { Choice } from '../tree.ts';
import {
  begin,
  chosen,
  type Event,
  FIRST,
  move,
  pathOf,
  type Point,
  SIDE,
} from '../walk.ts';

const leaf = (id: string): Choice => ({ id, label: id, onSelect: () => {} });

// Home, Entries, Settings (General, Keys, Gestures), About.
const TREE: ReadonlyArray<Choice> = [
  leaf('home'),
  leaf('entries'),
  {
    ...leaf('settings'),
    children: [leaf('general'), leaf('keys'), leaf('gestures')],
  },
  leaf('about'),
];

// Walks a finger through `points` from `start`: the path it marks, and
// what each move did.
const walkThrough = (
  points: ReadonlyArray<readonly [number, number]>,
  start: ReadonlyArray<string> = ['entries'],
) => {
  let walk = begin(TREE, start);
  const events: Array<Event> = [];
  for (const [x, y] of points) {
    const after = move(walk, TREE, start, { x, y } satisfies Point);
    walk = after.walk;
    if (after.event) events.push(after.event);
  }
  return { walk, path: pathOf(walk), events };
};

describe('a Thumb Picker walk Stepping up and down', () => {
  it('stays on the start short of the first Step', () => {
    expect(walkThrough([[0, FIRST - 1]]).path).toEqual([1]);
  });

  it('takes the first Step at the first travel, then one each stretch', () => {
    expect(walkThrough([[0, FIRST]]).path).toEqual([2]);
    expect(walkThrough([[0, -FIRST]]).path).toEqual([0]);
    expect(walkThrough([[0, FIRST + STEP]]).path).toEqual([3]);
  });

  it('holds at either end', () => {
    expect(walkThrough([[0, 1000]]).path).toEqual([3]);
    expect(walkThrough([[0, -1000]]).path).toEqual([0]);
  });

  it('starts where it was told, else on the first', () => {
    expect(begin(TREE, ['about']).levels[0]?.at).toBe(3);
    expect(begin(TREE, ['nowhere']).levels[0]?.at).toBe(0);
  });
});

describe('a Thumb Picker walk going sideways', () => {
  it('opens a choice with choices inside, on the first', () => {
    const { path, events } = walkThrough([
      [0, FIRST],
      [SIDE, FIRST],
    ]);
    expect(path).toEqual([2, 0]);
    expect(events).toEqual(['step', 'open']);
  });

  it('Steps through the opened choices from where it turned', () => {
    expect(
      walkThrough([
        [0, FIRST],
        [SIDE, FIRST],
        [SIDE, 2 * FIRST],
      ]).path,
    ).toEqual([2, 1]);
  });

  it('goes back, keeping the choice it had marked', () => {
    const { path, events } = walkThrough([
      [0, FIRST],
      [SIDE, FIRST],
      [SIDE, 2 * FIRST],
      [0, 2 * FIRST],
    ]);
    expect(path).toEqual([2]);
    expect(events).toEqual(['step', 'open', 'step', 'back']);
  });

  it('opens again on the choice last marked there', () => {
    expect(
      walkThrough([
        [0, FIRST],
        [SIDE, FIRST],
        [SIDE, 2 * FIRST],
        [0, 2 * FIRST],
        [SIDE, 2 * FIRST],
      ]).path,
    ).toEqual([2, 1]);
  });

  it('opens on where the swipe began, when it began inside', () => {
    expect(walkThrough([[SIDE, 0]], ['settings', 'gestures']).path).toEqual([
      2, 2,
    ]);
  });

  it('goes wrong once where there is nothing to open or go back to', () => {
    expect(walkThrough([[SIDE, 0]]).events).toEqual(['wrong']);
    expect(
      walkThrough([
        [-SIDE, 0],
        [-2 * SIDE, 0],
      ]).events,
    ).toEqual(['wrong']);
    expect(
      walkThrough([
        [SIDE, 0],
        [0, 0],
        [SIDE, 0],
      ]).events,
    ).toEqual(['wrong', 'wrong']);
  });

  it('ignores a drift sideways while Stepping', () => {
    expect(walkThrough([[SIDE, 3 * FIRST]]).events).toEqual(['step']);
  });
});

describe('what lifting a Thumb Picker walk chooses', () => {
  const lift = (
    points: ReadonlyArray<readonly [number, number]>,
    start: ReadonlyArray<string> = ['entries'],
  ) => chosen(walkThrough(points, start).walk, TREE, start)?.id;

  it('chooses the marked choice', () => {
    expect(lift([[0, -FIRST]])).toBe('home');
    expect(
      lift([
        [0, FIRST],
        [SIDE, FIRST],
        [SIDE, 2 * FIRST],
      ]),
    ).toBe('keys');
  });

  it('chooses nothing where the swipe began or on the way to it', () => {
    expect(lift([[0, 0]])).toBeUndefined();
    expect(lift([[0, 0]], ['settings', 'keys'])).toBeUndefined();
    expect(lift([[SIDE, 0]], ['settings', 'keys'])).toBeUndefined();
    expect(
      lift(
        [
          [SIDE, 0],
          [SIDE, -FIRST],
        ],
        ['settings', 'keys'],
      ),
    ).toBe('general');
  });
});
