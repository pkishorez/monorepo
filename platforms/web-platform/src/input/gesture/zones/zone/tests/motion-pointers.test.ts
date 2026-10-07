import { expect, it } from 'vitest';
import type { Pointer, Pointers } from '@kstackz/use-gesture';
import { createMotionPointers } from '../motion-pointers.ts';

const start = { x: 10, y: 10, t: 0 };

const finger = (
  x: number,
  y: number,
  end?: Pointer<null>['end'],
): Pointer<null> => ({
  id: 1,
  target: null,
  start,
  x,
  y,
  dx: x - start.x,
  dy: y - start.y,
  ...(end === undefined ? {} : { end }),
});

const of = (pointer: Pointer<null>): Pointers<null> =>
  new Map([[pointer.id, pointer]]);

it('keeps one finger’s motion values for its Gesture and sets them as it moves', () => {
  const motion = createMotionPointers();
  const landed = motion(of(finger(10, 10)));
  const own = landed.get(1);

  const moved = motion(of(finger(30, 50)));
  expect(moved).toBe(landed);
  expect([own?.x.get(), own?.y.get()]).toEqual([30, 50]);
  expect([own?.dx.get(), own?.dy.get()]).toEqual([20, 40]);
});

it('makes a new map as a finger lifts, keeping its motion values', () => {
  const motion = createMotionPointers();
  const landed = motion(of(finger(10, 10)));
  const lifted = motion(of(finger(10, 40, { x: 10, y: 40, t: 90 })));

  expect(lifted).not.toBe(landed);
  expect(lifted.get(1)?.end).toEqual({ x: 10, y: 40, t: 90 });
  expect(lifted.get(1)?.dy).toBe(landed.get(1)?.dy);
  expect(lifted.get(1)?.dy.get()).toBe(30);
});

it('gives the next Gesture’s finger new motion values, even with the same id', () => {
  const motion = createMotionPointers();
  const first = motion(of(finger(10, 10))).get(1);
  const next = motion(
    of({ ...finger(10, 10), start: { x: 10, y: 10, t: 0 } }),
  ).get(1);
  expect(next).not.toBe(first);
  expect(next?.dx).not.toBe(first?.dx);
});
