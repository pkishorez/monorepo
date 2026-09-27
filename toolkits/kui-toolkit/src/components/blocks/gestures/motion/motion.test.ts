// @vitest-environment jsdom
import { afterAll, describe, expect, it, vi } from 'vitest';

// motion reads the frame clock as it loads, so the fake one goes in first.
vi.hoisted(() => {
  vi.useFakeTimers({
    toFake: [
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
      'setTimeout',
      'clearTimeout',
      'Date',
    ],
  });
});

import { motionValue } from 'motion';
import type { Direction, MovementEvent } from '../engine';
import { createPan } from './pan';
import { createPinch } from './pinch';
import {
  COMMIT_PROGRESS,
  FLICK_VELOCITY,
  rubberBand,
  settle,
  shouldCommit,
} from './springs';
import { createSwipe, type SwipeOptions } from './swipe';

afterAll(() => {
  vi.useRealTimers();
});

/** Lets motion run for `ms`, a frame at a time, and its promises settle. */
const run = (ms: number) => vi.advanceTimersByTimeAsync(ms);

const event = (
  phase: MovementEvent['phase'],
  fields: Partial<MovementEvent> = {},
): MovementEvent => ({
  kind: 'swipe',
  phase,
  fingers: 1,
  hold: undefined,
  direction: 'right',
  point: { x: 0, y: 0 },
  offset: { x: 0, y: 0 },
  velocity: { x: 0, y: 0 },
  scale: 1,
  origin: { x: 0, y: 0 },
  edge: undefined,
  ...fields,
});

describe('shouldCommit', () => {
  it('commits a slow release at 40% of the travel or past it', () => {
    expect(shouldCommit({ progress: COMMIT_PROGRESS, velocity: 0 })).toBe(true);
    expect(shouldCommit({ progress: 0.39, velocity: 0 })).toBe(false);
    expect(shouldCommit({ progress: 0.2, velocity: 0.29 })).toBe(false);
  });

  it('lets a flick decide by its direction, whatever the distance', () => {
    expect(shouldCommit({ progress: 0.05, velocity: FLICK_VELOCITY })).toBe(
      true,
    );
    expect(shouldCommit({ progress: 0.9, velocity: -FLICK_VELOCITY })).toBe(
      false,
    );
  });
});

describe('rubberBand', () => {
  it('gives ground slower than the finger and never reaches the dimension', () => {
    expect(rubberBand(0, 300)).toBe(0);
    const small = rubberBand(50, 300);
    const large = rubberBand(5000, 300);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(50);
    expect(large).toBeLessThan(300);
    expect(large).toBeGreaterThan(small);
  });
});

describe('settle', () => {
  it('springs to the target and can be caught on the way', async () => {
    const value = motionValue(0);
    void settle(value, 100, { velocity: 1 });
    await run(48);
    const early = value.get();
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(100);
    value.stop();
    await run(500);
    expect(value.get()).toBe(early);
    void settle(value, 100);
    await run(2000);
    expect(value.get()).toBe(100);
  });
});

const swipe = (options: Partial<SwipeOptions> = {}) => {
  const progress = motionValue(0);
  const armed = motionValue(0);
  const onSwipe = vi.fn(options.onSwipe);
  const onCancel = vi.fn();
  const driver = createSwipe({ progress, armed }, () => ({
    direction: 'right',
    distance: 200,
    after: 'return',
    settle: true,
    ...options,
    onSwipe,
    onCancel,
  }));
  /** A drag of `dx` px along `direction`, released at `speed` px/ms. */
  const drag = (dx: number, speed = 0, direction: Direction = 'right') => {
    const sign = direction === 'right' ? 1 : -1;
    driver.handle(
      event('start', { direction, offset: { x: sign * 12, y: 0 } }),
    );
    driver.handle(event('move', { direction, offset: { x: sign * dx, y: 0 } }));
    return () =>
      driver.handle(
        event('end', {
          direction,
          offset: { x: sign * dx, y: 0 },
          velocity: { x: sign * speed, y: 0 },
        }),
      );
  };
  return { progress, armed, onSwipe, onCancel, driver, drag };
};

describe('createSwipe', () => {
  it('follows the finger, clamped at 0 and rubber-banded past 1', () => {
    const s = swipe();
    s.drag(100);
    expect(s.progress.get()).toBe(0.5);
    s.driver.handle(event('move', { offset: { x: -40, y: 0 } }));
    expect(s.progress.get()).toBe(0);
    s.driver.handle(event('move', { offset: { x: 400, y: 0 } }));
    expect(s.progress.get()).toBeGreaterThan(1);
    expect(s.progress.get()).toBeLessThan(1.5);
  });

  it('is armed while releasing now would commit', () => {
    const s = swipe();
    s.drag(60);
    expect(s.armed.get()).toBe(0);
    s.driver.handle(event('move', { offset: { x: 80, y: 0 } }));
    expect(s.armed.get()).toBe(1);
    s.driver.handle(
      event('move', { offset: { x: 20, y: 0 }, velocity: { x: 0.5, y: 0 } }),
    );
    expect(s.armed.get()).toBe(1);
    s.driver.handle(
      event('move', { offset: { x: 100, y: 0 }, velocity: { x: -0.5, y: 0 } }),
    );
    expect(s.armed.get()).toBe(0);
  });

  it('commits past 40%, runs onSwipe, and returns to 0', async () => {
    const s = swipe();
    s.drag(100)();
    expect(s.onSwipe).toHaveBeenCalledOnce();
    expect(s.armed.get()).toBe(0);
    await run(2000);
    expect(s.progress.get()).toBe(0);
    expect(s.onCancel).not.toHaveBeenCalled();
  });

  it('springs back and cancels below 40%, or on a backward flick', async () => {
    const s = swipe();
    s.drag(60)();
    await run(1000);
    expect(s.progress.get()).toBe(0);
    s.drag(150, -0.6)();
    await run(1000);
    expect(s.progress.get()).toBe(0);
    expect(s.onCancel).toHaveBeenCalledTimes(2);
    expect(s.onSwipe).not.toHaveBeenCalled();
  });

  it('commits on a forward flick however short', async () => {
    const s = swipe({ after: 'stay' });
    s.drag(20, 0.8)();
    await run(1000);
    expect(s.progress.get()).toBe(1);
  });

  it('holds at 1 until a returned promise settles, taking no Swipe meanwhile', async () => {
    let finish = () => {};
    const s = swipe({
      onSwipe: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    });
    s.drag(120)();
    await run(1500);
    expect(s.progress.get()).toBe(1);
    expect(s.driver.directions()).toEqual([]);
    finish();
    await run(1500);
    expect(s.progress.get()).toBe(0);
    expect(s.driver.directions()).toEqual(['right']);
  });

  it('stays at 1, and a Swipe the opposite way drags it back', async () => {
    const s = swipe({ after: 'stay' });
    s.drag(120)();
    await run(1000);
    expect(s.progress.get()).toBe(1);
    expect(s.driver.directions()).toEqual(['left']);
    s.drag(100, 0, 'left');
    expect(s.progress.get()).toBe(0.5);
    s.driver.handle(
      event('end', { direction: 'left', offset: { x: -100, y: 0 } }),
    );
    await run(1000);
    expect(s.progress.get()).toBe(0);
    // Not far enough back: it stays open.
    s.drag(120)();
    await run(1000);
    s.drag(40, 0, 'left')();
    await run(1000);
    expect(s.progress.get()).toBe(1);
  });

  it('is caught mid-spring and carries on from there, or where it was going', async () => {
    const s = swipe({ after: 'stay' });
    s.driver.open();
    await run(48);
    s.driver.catch();
    const caught = s.progress.get();
    expect(caught).toBeGreaterThan(0);
    expect(caught).toBeLessThan(1);
    expect(s.driver.directions()).toEqual(['right', 'left']);
    await run(500);
    expect(s.progress.get()).toBe(caught);
    s.driver.release();
    await run(1000);
    expect(s.progress.get()).toBe(1);

    s.driver.close();
    await run(48);
    s.driver.catch();
    const middle = s.progress.get();
    s.driver.handle(
      event('start', { direction: 'right', offset: { x: 12, y: 0 } }),
    );
    s.driver.handle(
      event('move', { direction: 'right', offset: { x: 20, y: 0 } }),
    );
    expect(s.progress.get()).toBeCloseTo(middle + 0.1);
  });

  it('opens with onSwipe and closes with nothing', async () => {
    const s = swipe({ after: 'stay' });
    s.driver.open();
    await run(1000);
    expect(s.progress.get()).toBe(1);
    expect(s.onSwipe).toHaveBeenCalledOnce();
    s.driver.close();
    await run(1000);
    expect(s.progress.get()).toBe(0);
    expect(s.onCancel).not.toHaveBeenCalled();
  });

  it('leaves the animation to the app with settle: false', async () => {
    const s = swipe({ settle: false, after: 'stay' });
    s.drag(120)();
    await run(1000);
    expect(s.progress.get()).toBe(0.6);
    expect(s.onSwipe).toHaveBeenCalledOnce();
  });
});

describe('createPan', () => {
  const pan = (
    options: Parameters<typeof createPan>[1] extends () => infer O
      ? Partial<O>
      : never = {},
  ) => {
    const x = motionValue(0);
    const y = motionValue(0);
    const driver = createPan(
      { x, y },
      () => ({ momentum: true, ...options }),
      () => ({
        width: 400,
        height: 800,
      }),
    );
    const drag = (dx: number, dy: number, velocity = { x: 0, y: 0 }) => {
      driver.handle(event('start', { kind: 'pan' }));
      driver.handle(event('move', { kind: 'pan', offset: { x: dx, y: dy } }));
      driver.handle(
        event('end', { kind: 'pan', offset: { x: dx, y: dy }, velocity }),
      );
    };
    return { x, y, driver, drag };
  };

  it('follows the fingers from where the values were, and coasts on a flick', async () => {
    const p = pan();
    p.drag(50, 20);
    expect(p.x.get()).toBe(50);
    expect(p.y.get()).toBe(20);
    p.drag(10, 0, { x: 1, y: 0 });
    await run(48);
    expect(p.x.get()).toBeGreaterThan(60);
    await run(3000);
    expect(p.x.get()).toBeGreaterThan(300);
    expect(p.y.get()).toBe(20);
  });

  it('keeps to one axis', () => {
    const p = pan({ axis: 'x' });
    p.drag(50, 80);
    expect(p.x.get()).toBe(50);
    expect(p.y.get()).toBe(0);
  });

  it('rubber-bands past the bounds and springs back inside', async () => {
    const p = pan({ bounds: { left: -100, right: 0 }, momentum: false });
    p.driver.handle(event('start', { kind: 'pan' }));
    p.driver.handle(event('move', { kind: 'pan', offset: { x: 120, y: 0 } }));
    expect(p.x.get()).toBeGreaterThan(0);
    expect(p.x.get()).toBeLessThan(120);
    p.driver.handle(event('end', { kind: 'pan', offset: { x: 120, y: 0 } }));
    await run(1500);
    expect(p.x.get()).toBe(0);
  });

  it('bounces off a bound when it coasts into it', async () => {
    const p = pan({ bounds: { left: -200, right: 0 } });
    p.drag(-20, 0, { x: -3, y: 0 });
    await run(4000);
    expect(p.x.get()).toBeCloseTo(-200, 0);
  });

  it('rests on a detent with snap', async () => {
    const p = pan({ snap: 100, axis: 'x' });
    p.drag(-20, 0, { x: -0.3, y: 0 });
    await run(4000);
    expect(p.x.get() % 100).toBe(-0);
  });

  it('is caught mid-coast by a touch', async () => {
    const p = pan();
    p.drag(0, 0, { x: 2, y: 0 });
    await run(64);
    p.driver.catch();
    const at = p.x.get();
    await run(1000);
    expect(p.x.get()).toBe(at);
  });
});

describe('createPinch', () => {
  const pinch = () => {
    const values = {
      scale: motionValue(1),
      originX: motionValue(0),
      originY: motionValue(0),
      x: motionValue(0),
      y: motionValue(0),
    };
    const driver = createPinch(
      values,
      () => ({ min: 1, max: 4 }),
      () => ({
        left: 100,
        top: 50,
      }),
    );
    return { ...values, driver };
  };
  const at = (x: number, y: number) => ({ x, y });

  it('scales by the fingers’ spread and keeps the point under them there', () => {
    const p = pinch();
    p.driver.handle(
      event('start', {
        kind: 'pinch',
        origin: at(300, 250),
        point: at(300, 250),
        scale: 1,
      }),
    );
    expect(p.originX.get()).toBe(200);
    expect(p.originY.get()).toBe(200);
    p.driver.handle(
      event('move', {
        kind: 'pinch',
        origin: at(300, 250),
        point: at(300, 250),
        scale: 2,
      }),
    );
    expect(p.scale.get()).toBe(2);
    // The content point at (200, 200) is still under the fingers: x + 2 × 200 = 200.
    expect(p.x.get()).toBeCloseTo(-200, 0);
    expect(p.y.get()).toBe(-200);
    // Moving the fingers moves it with them.
    p.driver.handle(
      event('move', {
        kind: 'pinch',
        origin: at(300, 250),
        point: at(350, 250),
        scale: 2,
      }),
    );
    expect(p.x.get()).toBe(-150);
  });

  it('rubber-bands past max and springs back to it', async () => {
    const p = pinch();
    p.driver.handle(
      event('start', {
        kind: 'pinch',
        origin: at(100, 50),
        point: at(100, 50),
      }),
    );
    p.driver.handle(
      event('move', {
        kind: 'pinch',
        origin: at(100, 50),
        point: at(100, 50),
        scale: 8,
      }),
    );
    expect(p.scale.get()).toBeGreaterThan(4);
    expect(p.scale.get()).toBeLessThan(8);
    p.driver.handle(
      event('end', {
        kind: 'pinch',
        origin: at(100, 50),
        point: at(100, 50),
        scale: 8,
      }),
    );
    await run(1500);
    expect(p.scale.get()).toBe(4);
    expect(p.x.get()).toBeCloseTo(0);
  });
});
