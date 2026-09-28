import { describe, expect, it } from 'vitest';
import { createGestureReading } from './gesture-reading';

const at = (id: number, x: number, y: number, t = 0) => ({ id, x, y, t });

describe('gesture reading', () => {
  it('moves with one finger relative to where it landed', () => {
    const reading = createGestureReading();
    expect(reading.down(at(1, 100, 100))).toBe('start');
    expect(reading.move(at(1, 130, 80))).toEqual({
      x: 30,
      y: -20,
      scale: 1,
      rotation: 0,
    });
    expect(reading.origin()).toEqual({ x: 100, y: 100 });
  });

  it("scales and rotates with two fingers, keeping the first finger's point under it", () => {
    const reading = createGestureReading();
    reading.down(at(1, 0, 0));
    expect(reading.down(at(2, 100, 0))).toBe('join');
    // Spread to twice the span and turn a quarter clockwise about (50, 0).
    reading.move(at(2, 50, 100));
    const values = reading.move(at(1, 50, -100));
    expect(values?.scale).toBeCloseTo(2);
    expect(values?.rotation).toBeCloseTo(90);
    expect(values?.x).toBeCloseTo(50);
    expect(values?.y).toBeCloseTo(-100);
  });

  it('keeps a point under the second finger when the first lifts', () => {
    const reading = createGestureReading();
    reading.down(at(1, 0, 0));
    reading.down(at(2, 100, 0));
    reading.move(at(2, 200, 0));
    reading.up(1);
    reading.move(at(2, 200, 50));
    // The origin was scaled 2x about (0,0) then moved down with finger 2.
    expect(reading.values()).toMatchObject({ x: 0, y: 50, scale: 2 });
  });

  it('carries on without a jump as fingers join and leave', () => {
    const reading = createGestureReading();
    reading.down(at(1, 0, 0));
    reading.move(at(1, 40, 0));
    reading.down(at(2, 240, 0));
    expect(reading.values().x).toBe(40);
    // Finger 1 holds still while finger 2 spreads: the origin stays under it.
    reading.move(at(2, 440, 0));
    expect(reading.values()).toMatchObject({ x: 40, scale: 2 });
    expect(reading.up(1)).toBe('leave');
    expect(reading.values().scale).toBeCloseTo(2);
    reading.move(at(2, 460, 10));
    expect(reading.values()).toMatchObject({ x: 60, y: 10 });
    expect(reading.values().scale).toBeCloseTo(2);
    expect(reading.up(2)).toBe('end');
    expect(reading.active()).toBe(false);
  });

  it('turns through ±180° without a full turn back', () => {
    const reading = createGestureReading();
    reading.down(at(1, 0, 0));
    reading.down(at(2, -100, 1));
    reading.move(at(2, -100, -1));
    expect(reading.values().rotation).toBeCloseTo(1.15, 1);
  });

  it('starts every new Gesture from nothing', () => {
    const reading = createGestureReading();
    reading.down(at(1, 0, 0));
    reading.move(at(1, 50, 50));
    reading.up(1);
    reading.down(at(1, 10, 10));
    expect(reading.values()).toEqual({ x: 0, y: 0, scale: 1, rotation: 0 });
  });

  it('measures speed over the last stretch only', () => {
    const reading = createGestureReading();
    reading.down(at(1, 0, 0, 0));
    reading.move(at(1, 10, 0, 10));
    reading.move(at(1, 20, 0, 20));
    expect(reading.velocity(20).x).toBeCloseTo(1000);
    expect(reading.velocity(500).x).toBe(0);
  });
});
