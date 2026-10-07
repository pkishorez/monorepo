import { thumbLock, TreeWalk } from '@kstackz/use-gesture';
import { describe, expect, it } from 'vitest';
import type { Choice } from '../src/patterns/thumb-picker/choice';
import { createPicking } from '../src/patterns/thumb-picker/picking';
import { phone } from './phone';

// A phone 400 points wide.
const WIDTH = 400;

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
  const choices = tree(chose);
  const ground = { tree: choices, start, ...TreeWalk.DISTANCES };
  const picking = createPicking(() => ground, {
    show: (walk) => shown.push(walk?.path.join('/')),
    feedback: (feedback) => heard.push(feedback),
    shake: () => shakes++,
    choose: (path) => TreeWalk.choiceAt(choices, path)?.onSelect?.(),
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
