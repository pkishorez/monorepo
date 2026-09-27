import { describe, expect, it } from 'vitest';
import { createPointerTracker } from './pointers.ts';
import { createVelocityTracker } from './velocity.ts';

describe('velocity', () => {
  it('uses the recent movement rather than the whole drag', () => {
    const tracker = createVelocityTracker();
    tracker.add({ x: 0, y: 0, t: 0 });
    tracker.add({ x: 10, y: 0, t: 40 });
    tracker.add({ x: 50, y: 0, t: 60 });
    expect(tracker.at(60).x).toBeCloseTo(50 / 60);
    tracker.add({ x: 90, y: 0, t: 80 });
    expect(tracker.at(80).x).toBeCloseTo(80 / 40);
  });

  it('does not dilute the last movement with an unchanged pointerup', () => {
    const pointers = createPointerTracker();
    pointers.down({ id: 1, x: 0, y: 0, t: 0 });
    pointers.move({ id: 1, x: 20, y: 0, t: 20 });
    pointers.move({ id: 1, x: 60, y: 0, t: 40 });
    pointers.up({ id: 1, x: 60, y: 0, t: 50 });
    expect(pointers.velocity(1, 50).x).toBeCloseTo(1.5);
  });

  it('reads zero after the finger has paused past the recent window', () => {
    const pointers = createPointerTracker();
    pointers.down({ id: 1, x: 0, y: 0, t: 0 });
    pointers.move({ id: 1, x: 60, y: 0, t: 40 });
    pointers.up({ id: 1, x: 60, y: 0, t: 120 });
    expect(pointers.velocity(1, 120).x).toBe(0);
  });
});
