import { describe, expect, it } from 'vitest';
import type { Choice } from '../tree.ts';
import { begin, chosen, DISTANCES, type Event, move } from '../walk.ts';

const { reveal: REVEAL, step: STEP } = DISTANCES;

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

// Walks a finger through `points` from `start`: the walk, the path it
// marks, and what each move did.
const walkThrough = (
  points: ReadonlyArray<readonly [number, number]>,
  start: ReadonlyArray<string> = ['entries'],
) => {
  let walk = begin(TREE, start);
  const events: Array<Event> = [];
  for (const [x, y] of points) {
    const after = move(walk, TREE, start, { x, y });
    walk = after.walk;
    events.push(...after.events);
  }
  return { walk, path: walk.path, events };
};

describe('a Thumb Picker walk showing', () => {
  it('shows nothing short of the reveal distance', () => {
    expect(walkThrough([[0, REVEAL - 1]]).walk.shown).toBe(false);
  });

  it('shows from the reveal distance, before any move', () => {
    const { walk, events } = walkThrough([[0, REVEAL]]);
    expect(walk.shown).toBe(true);
    expect(events).toEqual([]);
  });

  it('takes its distances from the caller', () => {
    const walk = begin(TREE, ['entries']);
    const after = move(
      walk,
      TREE,
      ['entries'],
      { x: 0, y: 10 },
      {
        reveal: 5,
        step: 10,
      },
    );
    expect(after.walk.shown).toBe(true);
    expect(after.walk.path).toEqual([2]);
  });
});

describe('a Thumb Picker walk Stepping up and down', () => {
  it('Steps once each step distance, either way', () => {
    expect(walkThrough([[0, STEP - 1]]).path).toEqual([1]);
    expect(walkThrough([[0, STEP]]).path).toEqual([2]);
    expect(walkThrough([[0, -STEP]]).path).toEqual([0]);
    expect(walkThrough([[0, 2 * STEP]]).path).toEqual([3]);
  });

  it('tells each Step of a fast move', () => {
    expect(walkThrough([[0, 2 * STEP]]).events).toEqual(['step', 'step']);
  });

  it('turns back at once, from where it turned, even past an end', () => {
    // Down to About, far past it, then back one step distance.
    expect(
      walkThrough([
        [0, 400],
        [0, 400 - STEP],
      ]).path,
    ).toEqual([2]);
  });

  it('starts where it was told, else on the first', () => {
    expect(begin(TREE, ['about']).path).toEqual([3]);
    expect(begin(TREE, ['nowhere']).path).toEqual([0]);
  });
});

describe('a Thumb Picker walk going sideways', () => {
  it('opens a choice with choices inside, on the first', () => {
    const { path, events } = walkThrough([
      [0, STEP],
      [STEP, STEP],
    ]);
    expect(path).toEqual([2, 0]);
    expect(events).toEqual(['step', 'open']);
  });

  it('Steps through the opened choices from where it turned', () => {
    expect(
      walkThrough([
        [0, STEP],
        [STEP, STEP],
        [STEP, 2 * STEP],
      ]).path,
    ).toEqual([2, 1]);
  });

  it('goes back, keeping the choice it had marked', () => {
    const { path, events } = walkThrough([
      [0, STEP],
      [STEP, STEP],
      [STEP, 2 * STEP],
      [0, 2 * STEP],
    ]);
    expect(path).toEqual([2]);
    expect(events).toEqual(['step', 'open', 'step', 'back']);
  });

  it('opens again on the choice last marked there', () => {
    expect(
      walkThrough([
        [0, STEP],
        [STEP, STEP],
        [STEP, 2 * STEP],
        [0, 2 * STEP],
        [STEP, 2 * STEP],
      ]).path,
    ).toEqual([2, 1]);
  });

  it('opens on where the swipe began, when it began inside', () => {
    expect(walkThrough([[STEP, 0]], ['settings', 'gestures']).path).toEqual([
      2, 2,
    ]);
  });

  it('goes wrong once a push where there is nothing to open', () => {
    expect(
      walkThrough([
        [STEP, 0],
        [3 * STEP, 0],
      ]).events,
    ).toEqual(['wrong']);
  });

  it('turns from a wrong push at once, from where it turned', () => {
    // Far left with nowhere to go back to, Step to Settings, then right.
    const { path, events } = walkThrough(
      [
        [-100, 0],
        [-100, STEP],
        [-100 + STEP, STEP],
      ],
      ['entries'],
    );
    expect(events).toEqual(['wrong', 'step', 'open']);
    expect(path).toEqual([2, 0]);
  });

  it('ignores a drift sideways while Stepping', () => {
    expect(walkThrough([[STEP - 1, 2 * STEP]]).events).toEqual([
      'step',
      'step',
    ]);
  });
});

describe('what lifting a Thumb Picker walk chooses', () => {
  const lift = (
    points: ReadonlyArray<readonly [number, number]>,
    start: ReadonlyArray<string> = ['entries'],
  ) => chosen(walkThrough(points, start).walk, TREE, start)?.id;

  it('chooses the marked choice', () => {
    expect(lift([[0, -STEP]])).toBe('home');
    expect(
      lift([
        [0, STEP],
        [STEP, STEP],
        [STEP, 2 * STEP],
      ]),
    ).toBe('keys');
  });

  it('chooses nothing where the swipe began or on the way to it', () => {
    expect(lift([[0, 0]])).toBeUndefined();
    expect(lift([[0, 0]], ['settings', 'keys'])).toBeUndefined();
    expect(lift([[STEP, 0]], ['settings', 'keys'])).toBeUndefined();
    expect(
      lift(
        [
          [STEP, 0],
          [STEP, -STEP],
        ],
        ['settings', 'keys'],
      ),
    ).toBe('general');
  });
});
