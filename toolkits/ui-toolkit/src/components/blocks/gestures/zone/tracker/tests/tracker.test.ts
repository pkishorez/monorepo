// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRAPPED_ATTRIBUTE } from '../../../touch-input';
import type { Pointers } from '../pointers';
import { createTracker, type GestureListener, type Tracker } from '../tracker';

const listener = (enabled = true) =>
  ({
    enabled: () => enabled,
    start: vi.fn(),
    pointer: vi.fn(),
    end: vi.fn(),
  }) satisfies GestureListener;

type Heard = ReturnType<typeof listener>;

const zone = (parent: Element, trapped = false) => {
  const element = document.createElement('div');
  element.dataset.slot = 'gesture-zone';
  if (trapped) element.setAttribute(TRAPPED_ATTRIBUTE, '');
  parent.appendChild(element);
  return element;
};

const child = (parent: Element) =>
  parent.appendChild(document.createElement('span'));

// A zone registered with `tracker`, with one listener.
const listened = (tracker: Tracker, element: Element, enabled = true) => {
  tracker.addZone(element);
  const heard = listener(enabled);
  tracker.addGesture(element, heard);
  return heard;
};

const at = (
  target: Element | null,
  id: number,
  x: number,
  y: number,
  t = 0,
) => ({ id, x, y, t, target });

const lastEnd = (heard: Heard) =>
  heard.end.mock.lastCall as [Pointers, { interrupted: boolean }];

afterEach(() => {
  document.body.replaceChildren();
});

describe('createTracker: one Gesture', () => {
  it('follows each finger with its own motion values, times from the first landing', () => {
    const tracker = createTracker();
    const screen = zone(document.body);
    const heard = listened(tracker, screen);
    const spot = child(screen);

    tracker.sink.down(at(spot, 1, 10, 10, 1000));
    tracker.sink.move(at(spot, 1, 30, 50, 1010));
    tracker.sink.down(at(screen, 2, 100, 100, 1040));
    tracker.sink.move(at(screen, 2, 90, 120, 1050));

    const [, pointers] = heard.pointer.mock.lastCall as [unknown, Pointers];
    const first = pointers.get(1);
    const second = pointers.get(2);
    expect(first?.target).toBe(spot);
    expect(first?.start).toEqual({ x: 10, y: 10, t: 0 });
    expect([first?.x.get(), first?.y.get()]).toEqual([30, 50]);
    expect([first?.dx.get(), first?.dy.get()]).toEqual([20, 40]);
    expect(second?.start).toEqual({ x: 100, y: 100, t: 40 });
    expect([second?.dx.get(), second?.dy.get()]).toEqual([-10, 20]);
  });

  it('keeps a lifted finger, frozen where it lifted, until the Gesture ends', () => {
    const tracker = createTracker();
    const screen = zone(document.body);
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
    expect(pointers.get(1)?.dy.get()).toBe(40);
    expect(pointers.get(2)?.end).toEqual({ x: 50, y: 40, t: 120 });
  });

  it('tells each landing and lifting, then starts afresh', () => {
    const tracker = createTracker();
    const screen = zone(document.body);
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
    const [pointers] = heard.start.mock.lastCall as [Pointers];
    expect([...pointers.keys()]).toEqual([7]);
    expect(pointers.get(7)?.start.t).toBe(0);
  });

  it('leaves the last release to the browser, whatever the Gesture was', () => {
    const tracker = createTracker();
    const screen = zone(document.body);
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
    const screen = zone(document.body);
    listened(tracker, screen);
    const { sink } = tracker;

    sink.down(at(screen, 1, 0, 0, 0));
    sink.down(at(screen, 2, 50, 0, 10));
    expect(sink.up(at(screen, 1, 0, 0, 50))).toBe(true);
    expect(sink.up(at(screen, 2, 50, 0, 60))).toBe(false);
  });

  it('lets a listener prevent the click of the last release', () => {
    const tracker = createTracker();
    const screen = zone(document.body);
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
    const screen = zone(document.body);
    const heard = listened(tracker, screen);
    tracker.sink.down(at(screen, 1, 0, 0, 0));
    tracker.sink.cancelAll();

    const [pointers, end] = lastEnd(heard);
    expect(end.interrupted).toBe(true);
    expect(pointers.get(1)?.end).toBeDefined();
    expect(tracker.sink.active()).toBe(false);
  });

  it('gives a Gesture only to listeners enabled as it starts', () => {
    const tracker = createTracker();
    const screen = zone(document.body);
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
    const screen = zone(document.body);
    const heard = listened(tracker, screen);
    const outside = child(document.body);
    expect(tracker.sink.down(at(outside, 1, 0, 0, 0))).toBe(false);
    expect(tracker.sink.active()).toBe(false);
    expect(heard.start).not.toHaveBeenCalled();
  });
});

describe('createTracker: which zones hear a Gesture', () => {
  it('reaches a nested zone and each zone around it', () => {
    const tracker = createTracker();
    const screen = zone(document.body);
    const list = zone(screen);
    const card = zone(list);
    const [onScreen, onList, onCard] = [screen, list, card].map((element) =>
      listened(tracker, element),
    );

    tracker.sink.down(at(child(card), 1, 0, 0, 0));
    for (const heard of [onScreen, onList, onCard]) {
      expect(heard?.start).toHaveBeenCalledTimes(1);
    }
  });

  it('never reaches a zone inside the one it starts in', () => {
    const tracker = createTracker();
    const screen = zone(document.body);
    const card = zone(screen);
    const onScreen = listened(tracker, screen);
    const onCard = listened(tracker, card);

    tracker.sink.down(at(child(screen), 1, 0, 0, 0));
    expect(onScreen.start).toHaveBeenCalledTimes(1);
    expect(onCard.start).not.toHaveBeenCalled();
  });

  it('stops at a trapped zone, which still hears it', () => {
    const tracker = createTracker();
    const screen = zone(document.body);
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
    const screen = zone(document.body);
    const row = zone(screen, true);
    const onScreen = listened(tracker, screen);
    listened(tracker, row);

    tracker.sink.down(at(row, 1, 0, 0, 0));
    tracker.sink.up(at(row, 1, 0, 0, 10));
    expect(onScreen.start).not.toHaveBeenCalled();

    row.removeAttribute(TRAPPED_ATTRIBUTE);
    tracker.sink.down(at(row, 1, 0, 0, 100));
    expect(onScreen.start).toHaveBeenCalledTimes(1);
  });

  it('lets later fingers join wherever they land; a sibling zone never hears it', () => {
    const tracker = createTracker();
    const screen = zone(document.body);
    const card = zone(screen, true);
    const map = zone(screen);
    const onCard = listened(tracker, card);
    const onMap = listened(tracker, map);
    const onScreen = listened(tracker, screen);

    tracker.sink.down(at(card, 1, 0, 0, 0));
    expect(tracker.sink.down(at(map, 2, 50, 0, 10))).toBe(true);
    expect(tracker.sink.down(at(child(document.body), 3, 90, 0, 20))).toBe(
      true,
    );
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
    const left = zone(document.body);
    const right = zone(document.body);
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
