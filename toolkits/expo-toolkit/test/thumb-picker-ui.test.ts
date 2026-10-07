import { thumbLock, TreeWalk } from '@kstackz/use-gesture';
import { describe, expect, it } from 'vitest';
import { dropRunner, feedOn, runnerOn } from '../src/input/ui-thread';
import { createPicking } from '../src/recipes/thumb-picker/picking';
import {
  HIDDEN,
  placeIn,
  shapeOf,
  type View,
  viewOf,
} from '../src/recipes/thumb-picker/view';

// The Thumb Picker as a phone runs it on its UI thread: Gesture Handler's
// touch events straight into the surface's UI-thread provider, the Thumb
// Lock and the picking there, and the menu's View written as it walks.
// Worklets run as plain functions here.

const leaf = (id: string) => ({ id, label: id });
const TREE = shapeOf([
  leaf('home'),
  leaf('entries'),
  leaf('months'),
  { ...leaf('settings'), children: [leaf('general'), leaf('gestures')] },
]);

let surfaces = 100;

const phone = (start: ReadonlyArray<string>) => {
  const id = ++surfaces;
  const log: Array<string> = [];
  const views: Array<View> = [];
  let view = HIDDEN;
  let now = 0;
  const ground = { tree: TREE, start, ...TreeWalk.DISTANCES };
  const picking = createPicking(() => ground, {
    show: (walk) => {
      view = viewOf(walk, TREE, start, view);
      views.push(view);
    },
    feedback: (event) => log.push(event),
    shake: () => log.push('shake'),
    choose: (path) => log.push(`choose ${TreeWalk.choiceAt(TREE, path)?.id}`),
  });
  runnerOn(id).add(
    1,
    thumbLock<null>({
      enabled: () => true,
      width: () => 400,
      onLock: () => {
        log.push('claim');
        picking.lock();
      },
      onMove: picking.move,
      onEnd: picking.end,
    }),
  );
  const event = (finger: number, x: number, y: number) => ({
    changedTouches: [{ id: finger, absoluteX: x, absoluteY: y }],
  });
  const at = { x: 300, y: 400 };
  return {
    log,
    views,
    view: () => view,
    down: (finger: number, x: number, y: number) =>
      feedOn(id, 'down', event(finger, x, y), (now += 16)),
    /** The finger (id 2) slides by (dx, dy) in six moves. */
    slide: (dx: number, dy: number) => {
      const from = { ...at };
      for (let i = 1; i <= 6; i++) {
        at.x = from.x + (dx * i) / 6;
        at.y = from.y + (dy * i) / 6;
        feedOn(id, 'move', event(2, at.x, at.y), (now += 16));
      }
    },
    up: (finger: number) =>
      feedOn(
        id,
        'up',
        finger === 2 ? event(2, at.x, at.y) : event(1, 40, 700),
        (now += 16),
      ),
    drop: () => dropRunner(id),
  };
};

describe('the Thumb Picker on the UI thread', () => {
  it('claims and locks in the event the second finger lands', () => {
    const touch = phone(['home']);
    touch.down(1, 40, 700);
    expect(touch.log).toEqual([]);
    touch.down(2, 300, 400);
    expect(touch.log).toEqual(['claim', 'lock']);
    expect(touch.view().shown).toBe(false);
    touch.drop();
  });

  it('shows the marked row move with each Step, and Goes on lift', () => {
    const touch = phone(['home']);
    touch.down(1, 40, 700);
    touch.down(2, 300, 400);
    touch.slide(0, 65);
    expect(touch.view()).toEqual({
      shown: true,
      open: [{ id: '', marked: 2 }],
    });
    touch.up(2);
    expect(touch.view().shown).toBe(false);
    expect(touch.log).toEqual([
      'claim',
      'lock',
      'step',
      'step',
      'choose months',
    ]);
    touch.drop();
  });

  it('opens a list to the right, behind which the top one sits', () => {
    const touch = phone(['months']);
    touch.down(1, 40, 700);
    touch.down(2, 300, 400);
    touch.slide(0, 32);
    touch.slide(35, 0);
    const view = touch.view();
    expect(view.open.map((list) => list.id)).toEqual(['', 'settings']);
    expect(placeIn(view, '')).toEqual({ back: 1, marked: 3 });
    expect(placeIn(view, 'settings')).toEqual({ back: 0, marked: 0 });
    touch.slide(0, 32);
    touch.up(2);
    expect(touch.log.at(-1)).toBe('choose gestures');
    touch.drop();
  });

  it('shakes for a Wrong Way and calls it off when the thumb lifts first', () => {
    const touch = phone(['home']);
    touch.down(1, 40, 700);
    touch.down(2, 300, 400);
    touch.slide(-80, 0);
    touch.up(1);
    touch.up(2);
    expect(touch.log).toEqual(['claim', 'lock', 'wrong', 'shake']);
    // It hides with its lists where they were, to fade out in place.
    expect(touch.view()).toMatchObject({
      shown: false,
      open: [{ id: '', marked: 0 }],
    });
    touch.drop();
  });

  it('leaves one finger alone, and a thumb on the right', () => {
    const touch = phone(['home']);
    touch.down(1, 300, 400);
    touch.down(2, 320, 420);
    touch.slide(0, 90);
    touch.up(2);
    touch.up(1);
    expect(touch.log).toEqual([]);
    touch.drop();
  });
});

describe('what the menu shows', () => {
  it('names only the lists a walk can open, as the walk names them', () => {
    const ids = TreeWalk.lists(TREE, ['home']).map((list) => list.id);
    expect(ids).toEqual(['', 'settings']);
  });

  it('places a list that is not open nowhere', () => {
    expect(placeIn(HIDDEN, 'settings')).toBeUndefined();
  });
});
