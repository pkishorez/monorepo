import { createGestureProvider, thumbLock } from '@kstackz/use-gesture';
import { describe, expect, it } from 'vitest';
import { createFeed } from '../src/input/feed';
import { edgeSwipe } from '../src/patterns/sidebar/edge';
import type { Choice } from '../src/patterns/thumb-picker/choice';
import { createPicking } from '../src/patterns/thumb-picker/picking';

// A phone 400 points wide, its touches as Gesture Handler reports them,
// through the input feed into use-gesture's core, as the GestureSurface does.
const WIDTH = 400;

const phone = () => {
  const zone = { surface: true };
  const provider = createGestureProvider<typeof zone, unknown>({
    zoneOf: () => zone,
    parentOf: () => null,
    trapped: () => false,
  });
  provider.addZone(zone);
  let now = 0;
  const feed = createFeed(provider.sink, zone, () => (now += 16));
  const touch = (id: number, x: number, y: number) => ({
    changedTouches: [{ id, absoluteX: x, absoluteY: y }],
  });
  return {
    listen: (listener: Parameters<typeof provider.addGesture>[1]) =>
      provider.addGesture(zone, listener),
    down: (id: number, x: number, y: number) => feed.down(touch(id, x, y)),
    move: (id: number, x: number, y: number) => feed.move(touch(id, x, y)),
    up: (id: number, x: number, y: number) => feed.up(touch(id, x, y)),
    cancelled: feed.cancelled,
    // A finger sliding from (x, y) by (dx, dy) in `steps` moves.
    slide: (
      id: number,
      from: { x: number; y: number },
      by: { dx: number; dy: number },
      steps = 6,
    ) => {
      for (let i = 1; i <= steps; i++) {
        feed.move(
          touch(id, from.x + (by.dx * i) / steps, from.y + (by.dy * i) / steps),
        );
      }
    },
  };
};

// Home, Entries, Months, then Settings with its Sections.
const tree = (chose: Array<string>): ReadonlyArray<Choice> => {
  const choice = (id: string, children?: ReadonlyArray<Choice>): Choice => ({
    id,
    label: id,
    onSelect: () => chose.push(id),
    ...(children ? { children } : {}),
  });
  return [
    choice('home'),
    choice('entries'),
    choice('months'),
    choice('settings', [choice('general'), choice('gestures')]),
  ];
};

const picker = (start: ReadonlyArray<string>) => {
  const chose: Array<string> = [];
  const heard: Array<string> = [];
  const shown: Array<string | undefined> = [];
  let shakes = 0;
  const ground = { tree: tree(chose), start };
  const picking = createPicking(() => ground, {
    show: (walk) => shown.push(walk?.path.join('/')),
    feedback: (feedback) => heard.push(feedback),
    shake: () => shakes++,
  });
  const listener = thumbLock<unknown>({
    enabled: () => true,
    width: () => WIDTH,
    onLock: picking.lock,
    onMove: picking.move,
    onEnd: picking.end,
  });
  return { chose, heard, shown, listener, shakes: () => shakes };
};

const THUMB = { x: 40, y: 700 };
const FINGER = { x: 300, y: 400 };

describe('Thumb Lock on a phone', () => {
  it('Steps down two Places and Goes there as the finger lifts', () => {
    const touch = phone();
    const pick = picker(['home']);
    touch.listen(pick.listener);
    touch.down(1, THUMB.x, THUMB.y);
    touch.down(2, FINGER.x, FINGER.y);
    touch.slide(2, FINGER, { dx: 0, dy: 65 });
    touch.up(2, FINGER.x, FINGER.y + 65);
    expect(pick.heard).toEqual(['lock', 'step', 'step']);
    expect(pick.chose).toEqual(['months']);
  });

  it('opens Settings to the right and Goes to a Section', () => {
    const touch = phone();
    const pick = picker(['months']);
    touch.listen(pick.listener);
    touch.down(1, THUMB.x, THUMB.y);
    touch.down(2, FINGER.x, FINGER.y);
    touch.slide(2, FINGER, { dx: 0, dy: 32 });
    touch.slide(2, { x: FINGER.x, y: FINGER.y + 32 }, { dx: 35, dy: 0 });
    touch.slide(2, { x: FINGER.x + 35, y: FINGER.y + 32 }, { dx: 0, dy: 32 });
    touch.up(2, FINGER.x + 35, FINGER.y + 64);
    expect(pick.heard).toEqual(['lock', 'step', 'open', 'step']);
    expect(pick.chose).toEqual(['gestures']);
  });

  it('shakes once for a Wrong Way, with nothing to choose', () => {
    const touch = phone();
    const pick = picker(['home']);
    touch.listen(pick.listener);
    touch.down(1, THUMB.x, THUMB.y);
    touch.down(2, FINGER.x, FINGER.y);
    touch.slide(2, FINGER, { dx: -80, dy: 0 });
    touch.up(2, FINGER.x - 80, FINGER.y);
    expect(pick.heard).toEqual(['lock', 'wrong']);
    expect(pick.shakes()).toBe(1);
    expect(pick.chose).toEqual([]);
  });

  it('chooses nothing when the thumb lifts first', () => {
    const touch = phone();
    const pick = picker(['home']);
    touch.listen(pick.listener);
    touch.down(1, THUMB.x, THUMB.y);
    touch.down(2, FINGER.x, FINGER.y);
    touch.slide(2, FINGER, { dx: 0, dy: 40 });
    touch.up(1, THUMB.x, THUMB.y);
    touch.up(2, FINGER.x, FINGER.y + 40);
    expect(pick.chose).toEqual([]);
    expect(pick.shown.at(-1)).toBeUndefined();
  });

  it('goes nowhere when the finger comes back to where it began', () => {
    const touch = phone();
    const pick = picker(['entries']);
    touch.listen(pick.listener);
    touch.down(1, THUMB.x, THUMB.y);
    touch.down(2, FINGER.x, FINGER.y);
    touch.slide(2, FINGER, { dx: 0, dy: 35 });
    touch.slide(2, { x: FINGER.x, y: FINGER.y + 35 }, { dx: 0, dy: -35 });
    touch.up(2, FINGER.x, FINGER.y);
    expect(pick.heard).toEqual(['lock', 'step', 'step']);
    expect(pick.chose).toEqual([]);
  });

  it('leaves a swipe of one finger to the page', () => {
    const touch = phone();
    const pick = picker(['home']);
    touch.listen(pick.listener);
    touch.down(1, FINGER.x, FINGER.y);
    touch.slide(1, FINGER, { dx: 0, dy: 120 });
    touch.up(1, FINGER.x, FINGER.y + 120);
    expect(pick.heard).toEqual([]);
  });

  it('is called off when Gesture Handler takes the touch', () => {
    const touch = phone();
    const pick = picker(['home']);
    touch.listen(pick.listener);
    touch.down(1, THUMB.x, THUMB.y);
    touch.down(2, FINGER.x, FINGER.y);
    touch.slide(2, FINGER, { dx: 0, dy: 40 });
    touch.cancelled();
    expect(pick.chose).toEqual([]);
    expect(pick.shown.at(-1)).toBeUndefined();
  });
});

describe('Sidebar edge on a phone', () => {
  const edge = () => {
    const log: Array<string> = [];
    const moves: Array<number> = [];
    let now = 0;
    const listener = edgeSwipe({
      enabled: () => true,
      onMove: (offset) => moves.push(offset),
      onEnd: (open) => log.push(open ? 'open' : 'shut'),
      claim: () => log.push('claim'),
      clock: () => (now += 200),
    });
    return { log, moves, listener };
  };

  it('opens under the finger on a swipe right from the left edge', () => {
    const touch = phone();
    const { log, moves, listener } = edge();
    touch.listen(listener);
    touch.down(1, 8, 400);
    touch.slide(1, { x: 8, y: 400 }, { dx: 120, dy: 4 });
    touch.up(1, 128, 404);
    expect(log).toEqual(['claim', 'open']);
    expect(moves.length).toBeGreaterThan(1);
    expect(moves.at(-1)).toBe(120);
    expect(moves).toEqual([...moves].sort((a, b) => a - b));
  });

  it('springs back shut for a short swipe', () => {
    const touch = phone();
    const { log, moves, listener } = edge();
    touch.listen(listener);
    touch.down(1, 8, 400);
    touch.slide(1, { x: 8, y: 400 }, { dx: 30, dy: 0 }, 3);
    touch.up(1, 38, 400);
    expect(log).toEqual(['claim', 'shut']);
    expect(moves.at(-1)).toBe(30);
  });

  it('springs back shut when a second finger lands', () => {
    const touch = phone();
    const { log, listener } = edge();
    touch.listen(listener);
    touch.down(1, 8, 400);
    touch.slide(1, { x: 8, y: 400 }, { dx: 60, dy: 0 });
    touch.down(2, 300, 400);
    touch.up(2, 300, 400);
    touch.up(1, 68, 400);
    expect(log).toEqual(['claim', 'shut']);
  });

  it('leaves a swipe from away from the edge, or with two fingers', () => {
    const touch = phone();
    const { log, listener } = edge();
    touch.listen(listener);
    touch.down(1, 120, 400);
    touch.slide(1, { x: 120, y: 400 }, { dx: 150, dy: 0 });
    touch.up(1, 270, 400);
    touch.down(1, 8, 700);
    touch.down(2, 300, 400);
    touch.slide(2, FINGER, { dx: 150, dy: 0 });
    touch.up(2, 450, 400);
    touch.up(1, 8, 700);
    // The thumb landing in the strip is claimed, so nothing scrolls; it never opens.
    expect(log).toEqual(['claim']);
  });
});
