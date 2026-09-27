import { describe, expect, it } from 'vitest';
import {
  GESTURE_KINDS,
  recognizersFor,
  type GestureEvent,
  type GestureKind,
} from '../recognizers';
import { createGestureEngine } from './engine';

const WIDTH = 400;

/**
 * An engine driven the way the DOM binding drives it: before every input,
 * due ticks fire in order, so holds and timeouts resolve on time.
 */
const setup = (kinds: ReadonlyArray<GestureKind> = GESTURE_KINDS) => {
  const events: Array<GestureEvent> = [];
  const engine = createGestureEngine({
    recognizers: recognizersFor(kinds),
    width: () => WIDTH,
    onGesture: (event) => events.push(event),
  });
  const advance = (t: number) => {
    for (
      let due = engine.nextDeadline();
      due !== undefined && due <= t;
      due = engine.nextDeadline()
    ) {
      engine.tick(due);
    }
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
  const names = () => events.map((event) => `${event.kind}:${event.phase}`);
  const last = <K extends GestureKind>(kind: K) =>
    events.findLast(
      (event): event is Extract<GestureEvent, { kind: K }> =>
        event.kind === kind,
    );
  const state = (kind: GestureKind) =>
    engine.inspect().states.find((entry) => entry.kind === kind)?.state;
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
    last,
    state,
  };
};

describe('tap', () => {
  it('waits out a double tap, then recognizes', () => {
    const g = setup();
    g.down(1, 100, 100, 0);
    g.up(1, 102, 101, 80);
    expect(g.names()).toEqual([]);
    expect(g.state('tap')).toBe('possible');
    g.advance(380);
    expect(g.names()).toEqual(['tap:ended']);
    expect(g.last('tap')).toMatchObject({ x: 102, y: 101, duration: 80 });
  });

  it('fires on release when no double tap is registered', () => {
    const g = setup(['tap']);
    g.down(1, 100, 100, 0);
    g.up(1, 100, 100, 50);
    expect(g.names()).toEqual(['tap:ended']);
  });

  it('fails when the finger moves past the slop', () => {
    const g = setup();
    g.down(1, 100, 100, 0);
    g.move(1, 100, 115, 40);
    g.up(1, 100, 115, 80);
    g.advance(1000);
    expect(g.names()).toEqual([]);
    expect(g.state('tap')).toBe('failed');
  });

  it('fails when held too long to be a tap', () => {
    const g = setup(['tap', 'double-tap']);
    g.down(1, 100, 100, 0);
    g.up(1, 100, 100, 400);
    g.advance(1000);
    expect(g.names()).toEqual([]);
  });
});

describe('double tap', () => {
  it('recognizes two quick taps in one place, and the single tap fails', () => {
    const g = setup();
    g.down(1, 100, 100, 0);
    g.up(1, 100, 100, 60);
    g.down(2, 104, 98, 180);
    g.up(2, 104, 98, 240);
    g.advance(2000);
    expect(g.names()).toEqual(['double-tap:ended']);
    expect(g.last('double-tap')).toMatchObject({ duration: 240 });
    expect(g.state('tap')).toBe('failed');
  });

  it('gives two taps when the second comes too late', () => {
    const g = setup();
    g.down(1, 100, 100, 0);
    g.up(1, 100, 100, 60);
    g.down(2, 100, 100, 500);
    g.up(2, 100, 100, 560);
    g.advance(2000);
    expect(g.names()).toEqual(['tap:ended', 'tap:ended']);
  });

  it('gives two taps when the second lands too far away', () => {
    const g = setup();
    g.down(1, 100, 100, 0);
    g.up(1, 100, 100, 60);
    g.down(2, 250, 100, 150);
    // The first tap is released as soon as the double tap fails.
    expect(g.names()).toEqual(['tap:ended']);
    g.up(2, 250, 100, 200);
    g.advance(2000);
    expect(g.names()).toEqual(['tap:ended', 'tap:ended']);
    expect(g.last('tap')).toMatchObject({ x: 250 });
  });
});

describe('long press', () => {
  it('begins after 500ms in place, follows the finger, ends on release', () => {
    const g = setup();
    g.down(1, 100, 100, 0);
    g.advance(499);
    expect(g.names()).toEqual([]);
    g.advance(500);
    expect(g.names()).toEqual(['long-press:began']);
    g.move(1, 104, 100, 600);
    g.up(1, 104, 100, 700);
    expect(g.names()).toEqual([
      'long-press:began',
      'long-press:changed',
      'long-press:ended',
    ]);
    expect(g.last('long-press')).toMatchObject({ x: 104, duration: 700 });
    expect(g.state('tap')).toBe('failed');
  });

  it('fails when the finger wanders before the hold completes', () => {
    const g = setup();
    g.down(1, 100, 100, 0);
    g.move(1, 100, 120, 200);
    g.advance(1000);
    g.up(1, 100, 120, 1000);
    expect(g.names()).toEqual([]);
  });
});

describe('pan', () => {
  it('follows a sideways drag with progress, direction and velocity', () => {
    const g = setup();
    g.down(1, 50, 300, 0);
    g.drag(1, { x: 50, y: 300 }, { x: 170, y: 306 }, 0, 160);
    g.up(1, 170, 306, 176);
    const kinds = g.names();
    expect(kinds[0]).toBe('pan:began');
    expect(kinds.at(-1)).toBe('pan:ended');
    expect(kinds.every((name) => name.startsWith('pan:'))).toBe(true);
    expect(g.last('pan')).toMatchObject({
      direction: 'right',
      dx: 120,
      distance: 120,
      progress: 120 / WIDTH,
    });
    expect(g.last('pan')?.velocity).toBeGreaterThan(0.5);
    expect(g.engine.inspect().claimed).toBe('pan');
  });

  it('reports leftward travel as negative', () => {
    const g = setup();
    g.down(1, 300, 300, 0);
    g.drag(1, { x: 300, y: 300 }, { x: 200, y: 300 }, 0, 100);
    g.up(1, 200, 300, 110);
    expect(g.last('pan')).toMatchObject({ direction: 'left', dx: -100 });
    expect(g.last('pan')?.velocity).toBeLessThan(0);
  });

  it('leaves a vertical drag alone, even if it turns sideways later', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.move(1, 102, 320, 16);
    g.move(1, 200, 330, 32);
    g.up(1, 200, 330, 48);
    g.advance(1000);
    expect(g.names()).toEqual([]);
    expect(g.state('pan')).toBe('failed');
  });

  it('ignores a second finger once going', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.drag(1, { x: 100, y: 300 }, { x: 150, y: 300 }, 0, 48);
    g.down(2, 300, 300, 60);
    g.move(2, 340, 300, 80);
    g.drag(1, { x: 150, y: 300 }, { x: 200, y: 300 }, 80, 112);
    g.up(2, 340, 300, 120);
    g.up(1, 200, 300, 130);
    expect(new Set(g.events.map((event) => event.kind))).toEqual(
      new Set(['pan']),
    );
    expect(g.last('pan')).toMatchObject({ phase: 'ended', dx: 100 });
  });

  it('never becomes a long press once claimed', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.drag(1, { x: 100, y: 300 }, { x: 140, y: 300 }, 0, 48);
    g.advance(2000);
    g.up(1, 140, 300, 2000);
    expect(g.names().filter((name) => name.startsWith('long-press'))).toEqual(
      [],
    );
  });
});

describe('two-finger pan', () => {
  it('follows two fingers dragged sideways together, at their midpoint', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.down(2, 200, 300, 10);
    for (let i = 1; i <= 6; i++) {
      g.move(1, 100 - i * 10, 300, 10 + i * 16);
      g.move(2, 200 - i * 10, 300, 12 + i * 16);
    }
    g.up(1, 40, 300, 120);
    expect(g.names()).toContain('two-finger-pan:began');
    expect(g.last('two-finger-pan')).toMatchObject({
      phase: 'ended',
      direction: 'left',
    });
    expect(g.last('two-finger-pan')?.dx).toBeCloseTo(-60, 0);
    expect(g.last('two-finger-pan')?.velocity).toBeLessThan(0);
    const kinds = new Set(g.events.map((event) => event.kind));
    expect(kinds).toEqual(new Set(['two-finger-pan']));
  });

  it('has no vertical form: two fingers dragged down scroll the page', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.down(2, 200, 300, 10);
    for (let i = 1; i <= 6; i++) {
      g.move(1, 100, 300 + i * 10, 10 + i * 16);
      g.move(2, 200, 300 + i * 10, 12 + i * 16);
    }
    g.up(1, 100, 360, 120);
    g.up(2, 200, 360, 130);
    g.advance(2000);
    expect(g.names()).toEqual([]);
  });
});

describe('pinch', () => {
  it('reports scale and center as the fingers spread', () => {
    const g = setup();
    g.down(1, 150, 300, 0);
    g.down(2, 250, 300, 10);
    for (let i = 1; i <= 5; i++) {
      g.move(1, 150 - i * 10, 300, 10 + i * 16);
      g.move(2, 250 + i * 10, 300, 12 + i * 16);
    }
    g.up(1, 100, 300, 100);
    expect(g.names()[0]).toBe('pinch:began');
    expect(g.last('pinch')).toMatchObject({
      phase: 'ended',
      scale: 2,
      x: 200,
      y: 300,
    });
  });

  it('reports a scale below 1 as the fingers close', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.down(2, 300, 300, 10);
    for (let i = 1; i <= 5; i++) {
      g.move(1, 100 + i * 10, 300, 10 + i * 16);
      g.move(2, 300 - i * 10, 300, 12 + i * 16);
    }
    g.up(2, 250, 300, 100);
    expect(g.last('pinch')).toMatchObject({ phase: 'ended', scale: 0.5 });
  });
});

describe('two-finger tap', () => {
  it('recognizes two fingers down and up quickly, at their midpoint', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.down(2, 200, 320, 20);
    g.up(1, 100, 300, 120);
    g.up(2, 200, 320, 140);
    expect(g.names()).toEqual(['two-finger-tap:ended']);
    expect(g.last('two-finger-tap')).toMatchObject({ x: 150, y: 310 });
  });

  it('fails when the fingers stay down too long', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.down(2, 200, 300, 20);
    g.up(1, 100, 300, 400);
    g.up(2, 200, 300, 420);
    g.advance(2000);
    expect(g.names()).toEqual([]);
  });
});

describe('hold-swipe', () => {
  const chord = (holder: number, swiper: number, to: number) => {
    const g = setup();
    g.down(1, holder, 300, 0);
    g.down(2, swiper, 300, 150);
    g.drag(2, { x: swiper, y: 300 }, { x: to, y: 302 }, 300, 400);
    g.up(2, to, 302, 410);
    g.up(1, holder, 300, 420);
    return g;
  };

  it('recognizes the left finger holding while the right swipes', () => {
    const g = chord(100, 200, 260);
    expect(g.names()[0]).toBe('hold-swipe:began');
    expect(g.last('hold-swipe')).toMatchObject({
      phase: 'ended',
      side: 'left-holds',
      direction: 'right',
      dx: 60,
    });
    expect(g.last('hold-swipe')?.duration).toBe(410);
  });

  it('recognizes the right finger holding while the left swipes', () => {
    const g = chord(300, 150, 90);
    expect(g.last('hold-swipe')).toMatchObject({
      phase: 'ended',
      side: 'right-holds',
      direction: 'left',
      dx: -60,
    });
  });

  it('beats pinch and two-finger pan, which wait for it to fail', () => {
    const g = chord(100, 200, 260);
    const kinds = new Set(g.events.map((event) => event.kind));
    expect(kinds).toEqual(new Set(['hold-swipe']));
    expect(g.state('pinch')).toBe('failed');
    expect(g.state('two-finger-pan')).toBe('failed');
  });

  it('needs the hold first: swiping at once is a pinch', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.down(2, 200, 300, 20);
    g.drag(2, { x: 200, y: 300 }, { x: 260, y: 300 }, 40, 120);
    g.up(2, 260, 300, 130);
    expect(g.names()[0]).toBe('pinch:began');
    expect(g.state('hold-swipe')).toBe('failed');
  });

  it('fails when the held finger moves before the swipe', () => {
    const g = setup(['hold-swipe']);
    g.down(1, 100, 300, 0);
    g.down(2, 200, 300, 150);
    g.move(1, 100, 320, 280);
    g.drag(2, { x: 200, y: 300 }, { x: 260, y: 300 }, 300, 400);
    expect(g.names()).toEqual([]);
  });
});

describe('arbitration', () => {
  it('shows every recognizer settled after a claim, and who claimed', () => {
    const g = setup();
    g.down(1, 50, 300, 0);
    g.drag(1, { x: 50, y: 300 }, { x: 120, y: 300 }, 0, 64);
    const inspection = g.engine.inspect();
    expect(inspection.claimed).toBe('pan');
    expect(
      Object.fromEntries(
        inspection.states.map((entry) => [entry.kind, entry.state]),
      ),
    ).toEqual({
      'hold-swipe': 'failed',
      pinch: 'failed',
      'two-finger-pan': 'failed',
      'two-finger-tap': 'failed',
      pan: 'changed',
      'long-press': 'failed',
      'double-tap': 'failed',
      tap: 'failed',
    });
  });

  it('starts every recognizer over on the next touch', () => {
    const g = setup();
    g.down(1, 50, 300, 0);
    g.drag(1, { x: 50, y: 300 }, { x: 120, y: 300 }, 0, 64);
    g.up(1, 120, 300, 80);
    g.down(1, 50, 300, 1000);
    expect(g.engine.inspect().states.every((s) => s.state === 'possible')).toBe(
      true,
    );
    expect(g.engine.inspect().claimed).toBeUndefined();
  });

  it('asks for a tick only while something waits on time', () => {
    const g = setup();
    expect(g.engine.nextDeadline()).toBeUndefined();
    g.down(1, 100, 100, 0);
    expect(g.engine.nextDeadline()).toBe(300);
    g.up(1, 100, 100, 50);
    expect(g.engine.nextDeadline()).toBe(350);
    g.advance(350);
    expect(g.engine.nextDeadline()).toBeUndefined();
  });
});

describe('a third pointer', () => {
  it('cancels a gesture under way and ignores the rest of the touch', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.down(2, 200, 300, 10);
    for (let i = 1; i <= 4; i++) {
      g.move(1, 100 + i * 10, 300, 10 + i * 16);
      g.move(2, 200 + i * 10, 300, 12 + i * 16);
    }
    expect(g.names().at(-1)).toBe('two-finger-pan:changed');
    g.down(3, 300, 400, 100);
    expect(g.names().at(-1)).toBe('two-finger-pan:cancelled');
    const before = g.events.length;
    g.move(1, 200, 300, 120);
    g.up(3, 300, 400, 130);
    g.up(2, 260, 300, 140);
    g.up(1, 200, 300, 150);
    g.advance(2000);
    expect(g.events.length).toBe(before);
    expect(g.engine.inspect().ignoring).toBe(true);
  });

  it('fails everything still deciding, and the next touch works again', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.down(2, 150, 300, 10);
    g.down(3, 200, 300, 20);
    g.up(1, 100, 300, 60);
    g.up(2, 150, 300, 70);
    g.up(3, 200, 300, 80);
    g.advance(2000);
    expect(g.names()).toEqual([]);
    g.down(1, 100, 300, 3000);
    g.up(1, 100, 300, 3050);
    g.advance(4000);
    expect(g.names()).toEqual(['tap:ended']);
  });
});

describe('pointercancel', () => {
  it('cancels a claimed gesture', () => {
    const g = setup();
    g.down(1, 50, 300, 0);
    g.drag(1, { x: 50, y: 300 }, { x: 120, y: 300 }, 0, 64);
    g.cancel(1, 120, 300, 80);
    expect(g.names().at(-1)).toBe('pan:cancelled');
    expect(g.last('pan')).toMatchObject({ dx: 70 });
    expect(g.state('pan')).toBe('cancelled');
  });

  it('fails everything when the browser takes a vertical scroll', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.move(1, 100, 306, 16);
    g.cancel(1, 100, 306, 20);
    g.advance(2000);
    expect(g.names()).toEqual([]);
    expect(g.engine.inspect().states.every((s) => s.state === 'failed')).toBe(
      true,
    );
  });

  it('cancelAll acts like the platform taking every pointer', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.advance(600);
    expect(g.names()).toEqual(['long-press:began']);
    g.engine.cancelAll();
    expect(g.names()).toEqual(['long-press:began', 'long-press:cancelled']);
    expect(g.engine.inspect().pointers).toEqual([]);
  });
});
