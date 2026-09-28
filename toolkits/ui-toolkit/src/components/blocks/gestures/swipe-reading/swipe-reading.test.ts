import { describe, expect, it } from 'vitest';
import { createSwipeReading } from './swipe-reading';

const moved = (x: number, y: number) => ({ x, y, scale: 1, rotation: 0 });
const still = { x: 0, y: 0, scale: 0, rotation: 0 };

describe('swipe reading', () => {
  it('fixes the axis at the first real movement', () => {
    const reading = createSwipeReading();
    reading.start({ x: 5, y: 5 });
    expect(reading.move(moved(3, 2))).toBeUndefined();
    expect(reading.move(moved(-12, 4))).toEqual({
      axis: 'x',
      distance: -12,
      started: true,
    });
    expect(reading.move(moved(-40, 90))).toEqual({
      axis: 'x',
      distance: -40,
      started: false,
    });
    expect(reading.end({ ...still, x: -300 })).toEqual({
      axis: 'x',
      distance: -40,
      origin: { x: 5, y: 5 },
      velocity: -300,
      interrupted: false,
    });
  });

  it('ends interrupted when a second finger lands, and stays ended', () => {
    const reading = createSwipeReading();
    reading.start({ x: 0, y: 0 });
    reading.move(moved(0, 30));
    expect(reading.join(still)?.interrupted).toBe(true);
    expect(reading.move(moved(0, 60))).toBeUndefined();
    expect(reading.end(still)).toBeUndefined();
  });

  it('never starts once two fingers were down', () => {
    const reading = createSwipeReading();
    reading.start({ x: 0, y: 0 });
    expect(reading.join(still)).toBeUndefined();
    expect(reading.move(moved(50, 0))).toBeUndefined();
  });

  it('is no Swipe when the finger lifts before moving', () => {
    const reading = createSwipeReading();
    reading.start({ x: 0, y: 0 });
    reading.move(moved(2, 2));
    expect(reading.end(still)).toBeUndefined();
  });
});
