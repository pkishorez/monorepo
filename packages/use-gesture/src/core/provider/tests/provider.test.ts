import { describe, expect, it, vi } from 'vitest';
import {
  createGestureProvider,
  type GestureListener,
  type GestureProvider,
  type Pointers,
  type ZoneTree,
} from '../index.ts';

// A plain tree stands in for a platform's: nodes, some of them zones.
type Node = {
  readonly parent: Node | null;
  readonly zone: boolean;
  trapped: boolean;
};

const zoneOf = (target: Node | null): Node | null =>
  target === null ? null : target.zone ? target : zoneOf(target.parent);

const TREE: ZoneTree<Node, Node | null> = {
  zoneOf,
  parentOf: (zone) => zoneOf(zone.parent),
  trapped: (zone) => zone.trapped,
};

type Tracker = GestureProvider<Node, Node | null>;

const createTracker = (): Tracker => createGestureProvider(TREE);

const page: Node = { parent: null, zone: false, trapped: false };

const listener = (enabled = true) =>
  ({
    enabled: () => enabled,
    start: vi.fn(),
    pointer: vi.fn(),
    end: vi.fn(),
  }) satisfies GestureListener<Node | null>;

type Heard = ReturnType<typeof listener>;

const zone = (parent: Node, trapped = false): Node => ({
  parent,
  zone: true,
  trapped,
});

const child = (parent: Node): Node => ({
  parent,
  zone: false,
  trapped: false,
});

// A zone registered with `tracker`, with one listener.
const listened = (tracker: Tracker, element: Node, enabled = true) => {
  tracker.addZone(element);
  const heard = listener(enabled);
  tracker.addGesture(element, heard);
  return heard;
};

const at = (target: Node | null, id: number, x: number, y: number, t = 0) => ({
  id,
  x,
  y,
  t,
  target,
});

const lastEnd = (heard: Heard) =>
  heard.end.mock.lastCall as [Pointers<Node | null>, { interrupted: boolean }];

describe('createGestureProvider: one Gesture', () => {
  it('follows each finger, times from the first landing', () => {
    const tracker = createTracker();
    const screen = zone(page);
    const heard = listened(tracker, screen);
    const spot = child(screen);

    tracker.sink.down(at(spot, 1, 10, 10, 1000));
    tracker.sink.move(at(spot, 1, 30, 50, 1010));
    tracker.sink.down(at(screen, 2, 100, 100, 1040));
    const landed = heard.pointer.mock.lastCall as [
      unknown,
      Pointers<Node | null>,
    ];
    tracker.sink.up(at(screen, 2, 90, 120, 1050));

    // Each change is a new map: one already handed over stays as it was.
    expect(landed[1].get(2)?.dx).toBe(0);
    const [, pointers] = heard.pointer.mock.lastCall as [
      unknown,
      Pointers<Node | null>,
    ];
    const first = pointers.get(1);
    const second = pointers.get(2);
    expect(first?.target).toBe(spot);
    expect(first?.start).toEqual({ x: 10, y: 10, t: 0 });
    expect([first?.x, first?.y]).toEqual([30, 50]);
    expect([first?.dx, first?.dy]).toEqual([20, 40]);
    expect(second?.start).toEqual({ x: 100, y: 100, t: 40 });
    expect([second?.dx, second?.dy]).toEqual([-10, 20]);
  });

  it('keeps a lifted finger, frozen where it lifted, until the Gesture ends', () => {
    const tracker = createTracker();
    const screen = zone(page);
    const heard = listened(tracker, screen);

    tracker.sink.down(at(screen, 1, 0, 0, 0));
    tracker.sink.down(at(screen, 2, 50, 0, 10));
    tracker.sink.up(at(screen, 1, 0, 40, 100));
    tracker.sink.move(at(screen, 1, 0, 90, 110));
    expect(heard.end).not.toHaveBeenCalled();
    tracker.sink.up(at(screen, 2, 50, 40, 120));

    const [pointers] = lastEnd(heard);
    expect([...pointers.keys()]).toEqual([1, 2]);
    expect(pointers.get(1)?.end).toEqual({ x: 0, y: 40, t: 100 });
    expect(pointers.get(1)?.dy).toBe(40);
    expect(pointers.get(2)?.end).toEqual({ x: 50, y: 40, t: 120 });
  });

  it('tells each landing and lifting, then starts afresh', () => {
    const tracker = createTracker();
    const screen = zone(page);
    const heard = listened(tracker, screen);

    tracker.sink.down(at(screen, 1, 0, 0, 0));
    tracker.sink.down(at(screen, 2, 0, 0, 5));
    tracker.sink.up(at(screen, 2, 0, 0, 50));
    tracker.sink.up(at(screen, 1, 0, 0, 60));
    expect(heard.start).toHaveBeenCalledTimes(1);
    expect(heard.pointer).toHaveBeenCalledTimes(4);
    expect(heard.end).toHaveBeenCalledTimes(1);

    tracker.sink.down(at(screen, 7, 5, 5, 500));
    expect(heard.start).toHaveBeenCalledTimes(2);
    const [pointers] = heard.start.mock.lastCall as [Pointers<Node | null>];
    expect([...pointers.keys()]).toEqual([7]);
    expect(pointers.get(7)?.start.t).toBe(0);
  });

  it('leaves the last release to the browser, whatever the Gesture was', () => {
    const tracker = createTracker();
    const screen = zone(page);
    listened(tracker, screen);
    const { sink } = tracker;

    sink.down(at(screen, 1, 0, 0, 0));
    expect(sink.up(at(screen, 1, 3, 0, 100))).toBe(false);

    // A long press.
    sink.down(at(screen, 1, 0, 0, 1000));
    expect(sink.up(at(screen, 1, 0, 0, 1600))).toBe(false);

    // Moved.
    sink.down(at(screen, 1, 0, 0, 2000));
    sink.move(at(screen, 1, 30, 0, 2050));
    expect(sink.up(at(screen, 1, 30, 0, 2100))).toBe(false);
  });

  it('never clicks for a finger lifting while others stay down', () => {
    const tracker = createTracker();
    const screen = zone(page);
    listened(tracker, screen);
    const { sink } = tracker;

    sink.down(at(screen, 1, 0, 0, 0));
    sink.down(at(screen, 2, 50, 0, 10));
    expect(sink.up(at(screen, 1, 0, 0, 50))).toBe(true);
    expect(sink.up(at(screen, 2, 50, 0, 60))).toBe(false);
  });

  it('lets a listener prevent the click of the last release', () => {
    const tracker = createTracker();
    const screen = zone(page);
    tracker.addZone(screen);
    tracker.addGesture(screen, {
      ...listener(),
      end: (_pointers, end) => end.preventClick(),
    });
    tracker.sink.down(at(screen, 1, 0, 0, 0));
    expect(tracker.sink.up(at(screen, 1, 0, 0, 50))).toBe(true);
  });

  it('ends as interrupted when the browser takes the touch', () => {
    const tracker = createTracker();
    const screen = zone(page);
    const heard = listened(tracker, screen);
    tracker.sink.down(at(screen, 1, 0, 0, 0));
    tracker.sink.cancelAll(500);

    const [pointers, end] = lastEnd(heard);
    expect(end.interrupted).toBe(true);
    expect(pointers.get(1)?.end).toBeDefined();
    expect(tracker.sink.active()).toBe(false);
  });

  it('gives a Gesture only to listeners enabled as it starts', () => {
    const tracker = createTracker();
    const screen = zone(page);
    const on = listened(tracker, screen);
    const off = listener(false);
    tracker.addGesture(screen, off);
    tracker.sink.down(at(screen, 1, 0, 0, 0));
    tracker.sink.up(at(screen, 1, 0, 0, 50));
    expect(on.end).toHaveBeenCalledTimes(1);
    expect(off.start).not.toHaveBeenCalled();
    expect(off.end).not.toHaveBeenCalled();
  });

  it('tracks nothing that starts outside its zones', () => {
    const tracker = createTracker();
    const screen = zone(page);
    const heard = listened(tracker, screen);
    const outside = child(page);
    expect(tracker.sink.down(at(outside, 1, 0, 0, 0))).toBe(false);
    expect(tracker.sink.active()).toBe(false);
    expect(heard.start).not.toHaveBeenCalled();
  });
});

describe('createGestureProvider: which zones hear a Gesture', () => {
  it('reaches a nested zone and each zone around it', () => {
    const tracker = createTracker();
    const screen = zone(page);
    const list = zone(screen);
    const card = zone(list);
    const [onScreen, onList, onCard] = [screen, list, card].map(
      (element: Node) => listened(tracker, element),
    );

    tracker.sink.down(at(child(card), 1, 0, 0, 0));
    for (const heard of [onScreen, onList, onCard]) {
      expect(heard?.start).toHaveBeenCalledTimes(1);
    }
  });

  it('never reaches a zone inside the one it starts in', () => {
    const tracker = createTracker();
    const screen = zone(page);
    const card = zone(screen);
    const onScreen = listened(tracker, screen);
    const onCard = listened(tracker, card);

    tracker.sink.down(at(child(screen), 1, 0, 0, 0));
    expect(onScreen.start).toHaveBeenCalledTimes(1);
    expect(onCard.start).not.toHaveBeenCalled();
  });

  it('stops at a trapped zone, which still hears it', () => {
    const tracker = createTracker();
    const screen = zone(page);
    const row = zone(screen, true);
    const button = zone(row);
    const onScreen = listened(tracker, screen);
    const onRow = listened(tracker, row);
    const onButton = listened(tracker, button);

    tracker.sink.down(at(child(button), 1, 0, 0, 0));
    expect(onButton.start).toHaveBeenCalledTimes(1);
    expect(onRow.start).toHaveBeenCalledTimes(1);
    expect(onScreen.start).not.toHaveBeenCalled();
  });

  it('reads trapped as each Gesture starts', () => {
    const tracker = createTracker();
    const screen = zone(page);
    const row = zone(screen, true);
    const onScreen = listened(tracker, screen);
    listened(tracker, row);

    tracker.sink.down(at(row, 1, 0, 0, 0));
    tracker.sink.up(at(row, 1, 0, 0, 10));
    expect(onScreen.start).not.toHaveBeenCalled();

    row.trapped = false;
    tracker.sink.down(at(row, 1, 0, 0, 100));
    expect(onScreen.start).toHaveBeenCalledTimes(1);
  });

  it('lets later fingers join wherever they land; a sibling zone never hears it', () => {
    const tracker = createTracker();
    const screen = zone(page);
    const card = zone(screen, true);
    const map = zone(screen);
    const onCard = listened(tracker, card);
    const onMap = listened(tracker, map);
    const onScreen = listened(tracker, screen);

    tracker.sink.down(at(card, 1, 0, 0, 0));
    expect(tracker.sink.down(at(map, 2, 50, 0, 10))).toBe(true);
    expect(tracker.sink.down(at(child(page), 3, 90, 0, 20))).toBe(true);
    tracker.sink.up(at(card, 1, 0, 0, 30));
    tracker.sink.up(at(map, 2, 50, 0, 40));
    tracker.sink.up(at(null, 3, 90, 0, 50));

    const [pointers] = lastEnd(onCard);
    expect([...pointers.keys()]).toEqual([1, 2, 3]);
    expect(onMap.start).not.toHaveBeenCalled();
    expect(onScreen.start).not.toHaveBeenCalled();
  });

  it('leaves another provider its own zones and fingers', () => {
    const one = createTracker();
    const other = createTracker();
    const left = zone(page);
    const right = zone(page);
    const onLeft = listened(one, left);
    const onRight = listened(other, right);

    expect(one.sink.down(at(left, 1, 0, 0, 0))).toBe(true);
    expect(other.sink.down(at(left, 1, 0, 0, 0))).toBe(false);
    expect(one.sink.down(at(right, 2, 50, 0, 10))).toBe(false);
    expect(other.sink.down(at(right, 2, 50, 0, 10))).toBe(true);
    expect(onLeft.start).toHaveBeenCalledTimes(1);
    expect(onRight.start).toHaveBeenCalledTimes(1);
  });
});

describe('createGestureProvider: a plain touch source', () => {
  const watching = (tracker: Tracker, element: Node) => {
    tracker.addZone(element);
    const heard = {
      ...listener(),
      move: vi.fn(),
      direction: vi.fn(),
      directions: () => 'all' as const,
    };
    tracker.addGesture(element, heard);
    return heard;
  };

  it('tells each move, and reads the Direction once a finger has gone SLOP px', () => {
    const tracker = createTracker();
    const screen = zone(page);
    const heard = watching(tracker, screen);

    tracker.sink.down(at(screen, 1, 0, 0, 0));
    tracker.sink.move(at(screen, 1, 4, 1, 10));
    expect(heard.direction).not.toHaveBeenCalled();
    tracker.sink.move(at(screen, 1, 12, 2, 20));
    tracker.sink.move(at(screen, 1, 0, 40, 30));

    expect(heard.move).toHaveBeenCalledTimes(3);
    const [pointer, pointers] = heard.move.mock.lastCall as [
      { dx: number; dy: number },
      Pointers<Node | null>,
    ];
    expect([pointer.dx, pointer.dy]).toEqual([0, 40]);
    expect(pointers.get(1)?.dy).toBe(40);
    expect(heard.direction).toHaveBeenCalledTimes(1);
    expect(heard.direction).toHaveBeenCalledWith('right');
  });

  it('leaves the Direction to the source while its moves are undecided', () => {
    const tracker = createTracker();
    const screen = zone(page);
    const heard = watching(tracker, screen);

    tracker.sink.down(at(screen, 1, 0, 0, 0));
    tracker.sink.move({ ...at(screen, 1, 0, 30, 10), undecided: true });
    expect(heard.direction).not.toHaveBeenCalled();
    expect(tracker.sink.pick('down')).toBe('directions');
    tracker.sink.settle('down');
    expect(heard.direction).toHaveBeenCalledWith('down');
    expect(tracker.sink.direction()).toBe('down');
  });

  it('lifts every finger where it is, at the time the source gives, when it cancels', () => {
    const tracker = createTracker();
    const screen = zone(page);
    const heard = watching(tracker, screen);

    tracker.sink.down(at(screen, 1, 0, 0, 100));
    tracker.sink.move(at(screen, 1, 3, 4, 120));
    tracker.sink.cancelAll(150);

    const [pointers, end] = lastEnd(heard);
    expect(end.interrupted).toBe(true);
    expect(pointers.get(1)?.end).toEqual({ x: 3, y: 4, t: 50 });
  });
});
