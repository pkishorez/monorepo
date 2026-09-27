import { SimulatedClock } from 'xstate';
import { describe, expect, it } from 'vitest';
import { createGestureEngine } from './engine';
import { ANCHOR_DRIFT_PX, DOUBLE_TAP_GAP_MS } from './thresholds';
import type { Axis, GestureEvent } from './types';

/**
 * An engine on a simulated clock, driven the way the DOM binding drives it:
 * the clock is moved to each input's time first, so holds and double-tap
 * waits resolve in order.
 */
const setup = (axis: Axis = 'x') => {
  const clock = new SimulatedClock();
  const events: Array<GestureEvent> = [];
  const engine = createGestureEngine({
    axis,
    onGesture: (event) => events.push(event),
    clock,
  });
  // A millisecond at a time: the simulated clock starts a timer set while
  // it fires others at the time it jumped to, not at the one it fired at.
  const advance = (t: number) => {
    while (clock.now() < t) clock.increment(Math.min(1, t - clock.now()));
  };
  const input =
    (type: 'down' | 'move' | 'up' | 'cancel') =>
    (id: number, x: number, y: number, t: number) => {
      advance(t);
      engine.feed({ id, type, x, y, t });
    };
  const down = input('down');
  const move = input('move');
  const up = input('up');
  const cancel = input('cancel');
  /** Moves pointer `id` in even steps, one every 16ms, ending at `to` at `t1`. */
  const drag = (
    id: number,
    from: { x: number; y: number },
    to: { x: number; y: number },
    t0: number,
    t1: number,
  ) => {
    const steps = Math.max(1, Math.round((t1 - t0) / 16));
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      move(
        id,
        from.x + (to.x - from.x) * k,
        from.y + (to.y - from.y) * k,
        t0 + (t1 - t0) * k,
      );
    }
  };
  const names = () =>
    events.map((event) =>
      'phase' in event ? `${event.kind}:${event.phase}` : event.kind,
    );
  // Without the pan's every move.
  const outcomes = () => names().filter((name) => name !== 'pan:changed');
  const last = <K extends GestureEvent['kind']>(kind: K) =>
    events.findLast(
      (event): event is Extract<GestureEvent, { kind: K }> =>
        event.kind === kind,
    );
  const roles = () => engine.inspect().fingers.map((finger) => finger.role);
  /** `{ anchored: 'panning' }` as `anchored.panning`. */
  const where = () => {
    const value = engine.inspect().value;
    return typeof value === 'string'
      ? value
      : Object.entries(value)
          .map(([key, child]) => `${key}.${String(child)}`)
          .join(' ');
  };
  /**
   * Pointer 1 down at `anchorX`, pointer 2 landing beside it 50ms later: 1
   * locks as the Anchor and 2 is the finger, pressed.
   */
  const lock = (anchorX = 100, actingX = 300, t = 0) => {
    down(1, anchorX, 300, t);
    down(2, actingX, 300, t + 50);
  };
  return {
    engine,
    events,
    advance,
    down,
    move,
    up,
    cancel,
    drag,
    names,
    outcomes,
    last,
    roles,
    where,
    lock,
  };
};

describe('tap', () => {
  it('waits out a double tap, then taps with no Anchor', () => {
    const g = setup();
    g.down(1, 100, 100, 0);
    g.up(1, 102, 101, 80);
    expect(g.names()).toEqual([]);
    g.advance(80 + DOUBLE_TAP_GAP_MS);
    expect(g.names()).toEqual(['tap']);
    expect(g.last('tap')).toEqual({
      kind: 'tap',
      x: 102,
      y: 101,
      anchor: undefined,
    });
  });

  it('is nothing when held too long, however long', () => {
    const g = setup();
    g.down(1, 100, 100, 0);
    g.up(1, 100, 100, 350);
    g.down(1, 100, 100, 1000);
    g.advance(5000);
    expect(g.roles()).toEqual(['pending']);
    g.up(1, 100, 100, 5000);
    g.advance(6000);
    expect(g.names()).toEqual([]);
  });
});

describe('double tap', () => {
  it('recognizes two quick taps in one place, with no single tap', () => {
    const g = setup();
    g.down(1, 100, 100, 0);
    g.up(1, 100, 100, 60);
    g.down(2, 104, 98, 180);
    g.up(2, 104, 98, 240);
    g.advance(2000);
    expect(g.names()).toEqual(['double-tap']);
    expect(g.last('double-tap')).toMatchObject({ x: 104, y: 98 });
  });

  it('gives two taps when the second comes too late or too far away', () => {
    const g = setup();
    g.down(1, 100, 100, 0);
    g.up(1, 100, 100, 60);
    g.down(2, 100, 100, 500);
    g.up(2, 100, 100, 560);
    g.down(3, 100, 100, 1000);
    g.up(3, 100, 100, 1060);
    g.down(4, 250, 100, 1150);
    // The third tap is released as soon as the fourth lands too far away.
    expect(g.names()).toEqual(['tap', 'tap', 'tap']);
    g.up(4, 250, 100, 1200);
    g.advance(3000);
    expect(g.names()).toEqual(['tap', 'tap', 'tap', 'tap']);
    expect(g.last('tap')).toMatchObject({ x: 250 });
  });
});

describe('swipe', () => {
  it('follows a sideways drag along the axis only, and is Captured', () => {
    const g = setup();
    g.down(1, 50, 300, 0);
    g.drag(1, { x: 50, y: 300 }, { x: 170, y: 306 }, 0, 160);
    expect(g.engine.captured()).toBe(true);
    expect(g.roles()).toEqual(['acting']);
    g.up(1, 170, 306, 176);
    const names = g.names();
    expect(names[0]).toBe('pan:began');
    expect(names.at(-1)).toBe('pan:ended');
    expect(names.every((name) => name.startsWith('pan:'))).toBe(true);
    expect(g.last('pan')).toMatchObject({
      dx: 120,
      dy: 0,
      velocityY: 0,
      anchor: undefined,
    });
    expect(g.last('pan')?.velocityX).toBeGreaterThan(0.5);
    expect(g.engine.captured()).toBe(false);
  });

  it('leaves a drag along the other axis to the browser, even if it turns later', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.move(1, 102, 320, 16);
    expect(g.where()).toBe('native');
    g.move(1, 200, 330, 32);
    expect(g.roles()).toEqual(['free']);
    expect(g.engine.captured()).toBe(false);
    g.up(1, 200, 330, 48);
    g.advance(1000);
    expect(g.names()).toEqual([]);
    expect(g.where()).toBe('idle');
  });

  it('follows the other axis when the zone pans on y', () => {
    const g = setup('y');
    g.down(1, 100, 300, 0);
    g.drag(1, { x: 100, y: 300 }, { x: 104, y: 200 }, 0, 100);
    g.up(1, 104, 200, 116);
    expect(g.last('pan')).toMatchObject({ phase: 'ended', dx: 0, dy: -100 });
    g.down(1, 100, 300, 1000);
    g.move(1, 130, 302, 1016);
    expect(g.where()).toBe('native');
  });

  it('keeps a second finger out of a pan under way', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.drag(1, { x: 100, y: 300 }, { x: 150, y: 300 }, 0, 48);
    g.down(2, 300, 300, 60);
    g.move(2, 340, 300, 80);
    g.drag(1, { x: 150, y: 300 }, { x: 200, y: 300 }, 80, 112);
    expect(g.roles()).toEqual(['acting', 'free']);
    g.up(1, 200, 300, 130);
    expect(g.engine.captured()).toBe(true);
    g.up(2, 340, 300, 140);
    expect(new Set(g.events.map((event) => event.kind))).toEqual(
      new Set(['pan']),
    );
    expect(g.last('pan')).toMatchObject({ phase: 'ended', dx: 100 });
  });
});

describe('release velocity', () => {
  it('is the flick when the finger lifts moving', () => {
    const g = setup();
    g.down(1, 300, 300, 0);
    g.drag(1, { x: 300, y: 300 }, { x: 200, y: 300 }, 0, 100);
    g.up(1, 200, 300, 110);
    expect(g.last('pan')?.velocityX).toBeLessThan(-0.5);
  });

  it('is 0 when the finger was held still before lifting', () => {
    const g = setup();
    g.down(1, 300, 300, 0);
    g.drag(1, { x: 300, y: 300 }, { x: 200, y: 300 }, 0, 100);
    g.up(1, 200, 300, 260);
    expect(g.last('pan')).toMatchObject({
      phase: 'ended',
      velocityX: 0,
      velocityY: 0,
    });
  });

  it('is 0 for an acting pan held still, whether it or the Anchor lifts', () => {
    const g = setup();
    g.lock();
    g.drag(2, { x: 300, y: 300 }, { x: 300, y: 200 }, 50, 150);
    g.up(2, 300, 200, 310);
    expect(g.last('pan')).toMatchObject({ velocityX: 0, velocityY: 0 });

    g.down(2, 300, 300, 1000);
    g.drag(2, { x: 300, y: 300 }, { x: 300, y: 200 }, 1000, 1100);
    expect(g.last('pan')?.velocityY).toBeLessThan(-0.5);
    g.up(1, 100, 300, 1300);
    expect(g.last('pan')).toMatchObject({
      phase: 'ended',
      velocityX: 0,
      velocityY: 0,
    });
  });

  it("is the acting finger's own, not the Anchor's", () => {
    const g = setup();
    g.lock();
    g.drag(2, { x: 300, y: 300 }, { x: 300, y: 200 }, 50, 150);
    g.move(1, 110, 300, 250);
    g.up(2, 300, 200, 270);
    expect(g.last('pan')).toMatchObject({ velocityX: 0, velocityY: 0 });
  });
});

describe('Anchor', () => {
  it('locks the moment a second finger lands beside a still first, and is Captured', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.move(1, 104, 303, 30);
    expect(g.engine.captured()).toBe(false);
    g.down(2, 300, 300, 40);
    expect(g.names()).toEqual(['anchor:locked']);
    expect(g.last('anchor')).toEqual({
      kind: 'anchor',
      phase: 'locked',
      x: 104,
      y: 303,
      side: 'left',
    });
    expect(g.roles()).toEqual(['anchor', 'pending']);
    expect(g.engine.captured()).toBe(true);
    expect(g.where()).toBe('anchored.pressing');
    expect(g.engine.inspect().anchor).toEqual({ side: 'left', x: 104, y: 303 });
  });

  it('is left or right of the finger landing beside it, wherever in the zone', () => {
    const left = setup();
    left.lock(300, 350);
    expect(left.last('anchor')?.side).toBe('left');
    const right = setup();
    right.lock(100, 50);
    expect(right.last('anchor')?.side).toBe('right');
  });

  it('keeps its side for the whole lock, wherever the finger goes', () => {
    const g = setup();
    g.lock(100, 300);
    g.drag(2, { x: 300, y: 300 }, { x: 20, y: 300 }, 50, 200);
    expect(g.last('pan')?.anchor?.side).toBe('left');
  });

  it('is not made when the first finger already moved', () => {
    const swipe = setup();
    swipe.down(1, 100, 300, 0);
    swipe.drag(1, { x: 100, y: 300 }, { x: 150, y: 300 }, 0, 48);
    swipe.down(2, 300, 300, 60);
    expect(swipe.names()).not.toContain('anchor:locked');
    expect(swipe.roles()).toEqual(['acting', 'free']);
    const scroll = setup();
    scroll.down(1, 100, 300, 0);
    scroll.move(1, 100, 330, 16);
    scroll.down(2, 300, 300, 40);
    expect(scroll.names()).toEqual([]);
    expect(scroll.engine.captured()).toBe(false);
  });

  it('modifies every tap, double tap and pan until it lifts', () => {
    const g = setup();
    g.lock();
    const anchor = { side: 'left', x: 100, y: 300 };
    // Tap.
    g.up(2, 300, 300, 100);
    g.advance(500);
    // Double tap.
    g.down(2, 300, 300, 1000);
    g.up(2, 300, 300, 1050);
    g.down(2, 302, 300, 1150);
    g.up(2, 302, 300, 1200);
    // Pan, up and down first.
    g.down(2, 300, 300, 1500);
    g.drag(2, { x: 300, y: 300 }, { x: 280, y: 200 }, 1500, 1600);
    g.up(2, 280, 200, 1616);
    // Another tap after the pan.
    g.down(2, 250, 250, 2000);
    g.up(2, 250, 250, 2040);
    g.advance(2500);
    expect(g.outcomes()).toEqual([
      'anchor:locked',
      'tap',
      'double-tap',
      'pan:began',
      'pan:ended',
      'tap',
    ]);
    for (const event of g.events) {
      if (event.kind !== 'anchor') expect(event.anchor).toEqual(anchor);
    }
    expect(g.roles()).toEqual(['anchor']);
    expect(g.engine.captured()).toBe(true);
    expect(g.where()).toBe('anchored.idle');
  });

  it('pans the other finger freely in 2D', () => {
    const g = setup();
    g.lock();
    g.drag(2, { x: 300, y: 300 }, { x: 304, y: 200 }, 50, 130);
    expect(g.roles()).toEqual(['anchor', 'acting']);
    g.drag(2, { x: 304, y: 200 }, { x: 360, y: 150 }, 130, 210);
    expect(g.last('pan')).toMatchObject({ dx: 60, dy: -150 });
    expect(g.where()).toBe('anchored.panning');
  });

  it('releases when it lifts, ending a pan under way first', () => {
    const g = setup();
    g.lock();
    g.drag(2, { x: 300, y: 300 }, { x: 300, y: 200 }, 50, 150);
    g.up(1, 100, 300, 160);
    expect(g.outcomes().slice(-2)).toEqual(['pan:ended', 'anchor:released']);
    expect(g.last('pan')?.anchor).toEqual({ side: 'left', x: 100, y: 300 });
    // The other finger is still down: Captured, part of nothing.
    expect(g.roles()).toEqual(['free']);
    expect(g.engine.captured()).toBe(true);
    const before = g.events.length;
    g.move(2, 300, 150, 170);
    g.up(2, 300, 150, 180);
    expect(g.events.length).toBe(before);
    expect(g.engine.captured()).toBe(false);
    expect(g.where()).toBe('idle');
  });

  it('releases a tap still waiting on a double tap before it goes', () => {
    const g = setup();
    g.lock();
    g.up(2, 300, 300, 90);
    g.up(1, 100, 300, 150);
    expect(g.outcomes()).toEqual(['anchor:locked', 'tap', 'anchor:released']);
  });

  it('cancels when it drifts, and ignores the rest of the touch', () => {
    const g = setup();
    g.lock();
    g.drag(2, { x: 300, y: 300 }, { x: 300, y: 250 }, 50, 98);
    g.move(1, 100, 300 + ANCHOR_DRIFT_PX, 110);
    expect(g.last('anchor')?.phase).toBe('locked');
    g.move(1, 100, 301 + ANCHOR_DRIFT_PX, 120);
    expect(g.outcomes().slice(-2)).toEqual([
      'pan:cancelled',
      'anchor:cancelled',
    ]);
    expect(g.engine.captured()).toBe(true);
    const before = g.events.length;
    g.drag(2, { x: 300, y: 250 }, { x: 200, y: 250 }, 120, 170);
    g.up(2, 200, 250, 180);
    g.up(1, 100, 325, 190);
    g.advance(2000);
    expect(g.events.length).toBe(before);
  });

  it('leaves a finger held still beside it undecided, and nothing', () => {
    const g = setup();
    g.lock();
    g.advance(1500);
    expect(g.roles()).toEqual(['anchor', 'pending']);
    g.up(2, 300, 300, 1600);
    g.advance(2500);
    expect(g.outcomes()).toEqual(['anchor:locked']);
  });

  it('a third finger cancels it and the pan under way', () => {
    const g = setup();
    g.lock();
    g.drag(2, { x: 300, y: 300 }, { x: 300, y: 240 }, 50, 114);
    g.down(3, 250, 400, 130);
    expect(g.outcomes().slice(-2)).toEqual([
      'pan:cancelled',
      'anchor:cancelled',
    ]);
    const before = g.events.length;
    g.move(2, 300, 200, 140);
    g.up(3, 250, 400, 150);
    g.up(2, 300, 200, 160);
    g.up(1, 100, 300, 170);
    g.advance(2000);
    expect(g.events.length).toBe(before);
    expect(g.where()).toBe('idle');
  });
});

describe('pointercancel', () => {
  it('cancels a pan under way', () => {
    const g = setup();
    g.down(1, 50, 300, 0);
    g.drag(1, { x: 50, y: 300 }, { x: 120, y: 300 }, 0, 64);
    g.cancel(1, 120, 300, 80);
    expect(g.names().at(-1)).toBe('pan:cancelled');
    expect(g.last('pan')).toMatchObject({ dx: 70 });
  });

  it('cancelAll acts like the platform taking every pointer', () => {
    const g = setup();
    g.lock();
    g.drag(2, { x: 300, y: 300 }, { x: 250, y: 300 }, 50, 114);
    g.engine.cancelAll();
    expect(g.outcomes().slice(-2)).toEqual([
      'pan:cancelled',
      'anchor:cancelled',
    ]);
    expect(g.engine.inspect().fingers).toEqual([]);
    expect(g.engine.captured()).toBe(false);
  });
});

describe('inspect', () => {
  it('reports the last tap with a count, for layers to answer once', () => {
    const g = setup();
    g.down(1, 100, 100, 0);
    g.up(1, 100, 100, 50);
    g.advance(1000);
    expect(g.engine.inspect().tap).toEqual({
      kind: 'tap',
      x: 100,
      y: 100,
      count: 1,
    });
  });
});
