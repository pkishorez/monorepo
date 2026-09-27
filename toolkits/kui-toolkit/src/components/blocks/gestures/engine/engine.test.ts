import { describe, expect, it } from 'vitest';
import {
  GESTURE_KINDS,
  recognizersFor,
  type GestureEvent,
  type GestureKind,
} from '../recognizers';
import { ANCHOR_DRIFT_PX, ANCHOR_MS } from '../recognizers/thresholds';
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
});

describe('chord', () => {
  /** The Anchor down at `anchor` at 0, the acting finger landing at `acting` at `t`. */
  const land = (anchor: number, acting: number, t = ANCHOR_MS) => {
    const g = setup();
    g.down(1, anchor, 300, 0);
    g.down(2, acting, 300, t);
    return g;
  };
  const roles = (g: ReturnType<typeof setup>) =>
    g.engine.inspect().fingers.map((finger) => finger.role);

  it('claims the moment the second finger lands, before either moves', () => {
    const g = land(100, 250);
    expect(g.names()).toEqual(['chord:began']);
    expect(g.last('chord')).toMatchObject({
      side: 'left',
      anchor: { x: 100, y: 300 },
      x: 250,
      axis: undefined,
      dx: 0,
      dy: 0,
      velocity: 0,
      duration: ANCHOR_MS,
    });
    expect(g.engine.inspect().claimed).toBe('chord');
    expect(g.engine.captured()).toBe(true);
    expect(roles(g)).toEqual(['anchor', 'acting']);
  });

  it('is nothing when the second finger lands sooner: no claim, no capture', () => {
    const g = land(100, 250, ANCHOR_MS - 1);
    g.drag(2, { x: 250, y: 300 }, { x: 250, y: 200 }, ANCHOR_MS, 300);
    g.up(2, 250, 200, 310);
    g.up(1, 100, 300, 320);
    g.advance(2000);
    expect(g.names()).toEqual([]);
    expect(g.engine.inspect().claimed).toBeUndefined();
    expect(g.engine.captured()).toBe(false);
  });

  it('is nothing when the first finger moved before the second landed', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.move(1, 100, 314, 100);
    g.down(2, 250, 300, 200);
    expect(g.names()).toEqual([]);
    expect(g.state('chord')).toBe('failed');
  });

  it('tells which side the Anchor is on', () => {
    expect(land(100, 250).last('chord')?.side).toBe('left');
    expect(land(300, 150).last('chord')?.side).toBe('right');
  });

  it('locks the axis by the first movement past the slop', () => {
    const g = land(100, 250);
    g.move(2, 252, 294, 170);
    expect(g.last('chord')).toMatchObject({
      phase: 'changed',
      axis: undefined,
    });
    g.drag(2, { x: 252, y: 294 }, { x: 256, y: 220 }, 170, 250);
    expect(g.last('chord')).toMatchObject({ axis: 'vertical', dy: -80 });
    expect(g.last('chord')?.velocity).toBeLessThan(-0.5);
    // Turning sideways later keeps it vertical.
    g.drag(2, { x: 256, y: 220 }, { x: 380, y: 216 }, 250, 330);
    expect(g.last('chord')).toMatchObject({ axis: 'vertical', dx: 130 });
    g.up(2, 380, 216, 340);
    expect(g.last('chord')?.phase).toBe('ended');
  });

  it('locks sideways, with velocity along x', () => {
    const g = land(100, 250);
    g.drag(2, { x: 250, y: 300 }, { x: 150, y: 304 }, ANCHOR_MS, 230);
    expect(g.last('chord')).toMatchObject({ axis: 'horizontal', dx: -100 });
    expect(g.last('chord')?.velocity).toBeLessThan(-0.5);
  });

  it('ends when the Anchor lifts, and holds the capture until every finger is up', () => {
    const g = land(100, 250);
    g.drag(2, { x: 250, y: 300 }, { x: 250, y: 250 }, ANCHOR_MS, 200);
    g.up(1, 100, 300, 210);
    expect(g.names().at(-1)).toBe('chord:ended');
    expect(g.last('chord')).toMatchObject({ x: 250, y: 250 });
    expect(roles(g)).toEqual(['free']);
    expect(g.engine.captured()).toBe(true);
    g.up(2, 250, 250, 220);
    expect(g.engine.captured()).toBe(false);
  });

  it('cancels when the Anchor drifts too far', () => {
    const g = land(100, 250);
    g.move(1, 100, 300 + ANCHOR_DRIFT_PX, 170);
    expect(g.names()).toEqual(['chord:began']);
    g.move(1, 100, 301 + ANCHOR_DRIFT_PX, 180);
    expect(g.names()).toEqual(['chord:began', 'chord:cancelled']);
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
      chord: 'failed',
      pan: 'changed',
      'double-tap': 'failed',
      tap: 'failed',
    });
  });

  it('marks fingers pending until the touch is decided, then acting or free', () => {
    const g = setup();
    g.down(1, 50, 300, 0);
    expect(g.engine.inspect().fingers[0]?.role).toBe('pending');
    g.drag(1, { x: 50, y: 300 }, { x: 120, y: 300 }, 0, 64);
    expect(g.engine.inspect().fingers[0]?.role).toBe('acting');
    g.down(2, 300, 300, 80);
    expect(g.engine.inspect().fingers.map((f) => f.role)).toEqual([
      'acting',
      'free',
    ]);
  });

  it('captures only a claimed touch', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.move(1, 100, 320, 16);
    expect(g.engine.captured()).toBe(false);
    g.up(1, 100, 320, 32);
    g.down(1, 50, 300, 1000);
    g.drag(1, { x: 50, y: 300 }, { x: 120, y: 300 }, 1000, 1064);
    expect(g.engine.captured()).toBe(true);
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
    g.down(2, 200, 300, 200);
    g.drag(2, { x: 200, y: 300 }, { x: 200, y: 240 }, 200, 264);
    expect(g.names().at(-1)).toBe('chord:changed');
    g.down(3, 300, 400, 280);
    expect(g.names().at(-1)).toBe('chord:cancelled');
    const before = g.events.length;
    g.move(2, 200, 200, 290);
    g.up(3, 300, 400, 300);
    g.up(2, 200, 200, 310);
    g.up(1, 100, 300, 320);
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
    g.down(1, 50, 300, 0);
    g.drag(1, { x: 50, y: 300 }, { x: 120, y: 300 }, 0, 64);
    g.engine.cancelAll();
    expect(g.names().at(-1)).toBe('pan:cancelled');
    expect(g.engine.inspect().fingers).toEqual([]);
    expect(g.engine.captured()).toBe(false);
  });
});
