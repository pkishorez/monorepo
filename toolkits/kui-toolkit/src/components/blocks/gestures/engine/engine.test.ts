import { SimulatedClock } from 'xstate';
import { describe, expect, it } from 'vitest';
import { createGestureEngine } from './engine';
import { DOUBLE_TAP_GAP_MS, HOLD_DRIFT_PX, TAP_MAX_MS } from './thresholds';
import type {
  Combination,
  Direction,
  GestureEvent,
  Policy,
  Scroll,
  TouchStart,
} from './types';

type Key = `${1 | 2}:${'none' | 'left' | 'right'}`;

/** What is registered, by combination: `1:none`, `2:left`… */
type Registered = {
  readonly pan?: ReadonlyArray<Key>;
  readonly swipe?: Partial<Record<Key, ReadonlyArray<Direction>>>;
  readonly pinch?: ReadonlyArray<'none' | 'left' | 'right'>;
  readonly doubleTap?: ReadonlyArray<Key>;
  /** Edge swipes, from the strip they start in. */
  readonly edge?: ReadonlyArray<Direction>;
};

const keyOf = (combination: Combination): Key =>
  `${combination.fingers}:${combination.hold ?? 'none'}`;

const policyOf = (registered: Registered): Policy => ({
  movement: (combination, direction, edge) => {
    if (edge !== undefined) {
      return registered.edge?.includes(direction) ? 'swipe' : undefined;
    }
    const key = keyOf(combination);
    if (registered.pan?.includes(key)) return 'pan';
    return registered.swipe?.[key]?.includes(direction) ? 'swipe' : undefined;
  },
  pinch: (hold) => registered.pinch?.includes(hold ?? 'none') ?? false,
  doubleTap: (combination) =>
    registered.doubleTap?.includes(keyOf(combination)) ?? false,
});

const EVERYTHING: Registered = {
  pan: ['1:none', '1:left', '1:right', '2:none', '2:left', '2:right'],
  pinch: ['none', 'left', 'right'],
};

/**
 * An engine on a simulated clock, driven the way the DOM binding drives it:
 * the clock is moved to each input's time first, so waits resolve in order.
 */
const setup = (
  registered: Registered = EVERYTHING,
  scroll: Scroll = 'none',
) => {
  const clock = new SimulatedClock();
  const events: Array<GestureEvent> = [];
  const engine = createGestureEngine({
    scroll,
    policy: policyOf(registered),
    onGesture: (event) => events.push(event),
    clock,
  });
  // A millisecond at a time: the simulated clock starts a timer set while
  // it fires others at the time it jumped to, not at the one it fired at.
  const advance = (t: number) => {
    while (clock.now() < t) clock.increment(Math.min(1, t - clock.now()));
  };
  const input =
    (type: 'move' | 'up' | 'cancel') =>
    (id: number, x: number, y: number, t: number) => {
      advance(t);
      engine.feed({ id, type, x, y, t });
    };
  const down = (
    id: number,
    x: number,
    y: number,
    t: number,
    start?: TouchStart,
  ) => {
    advance(t);
    engine.feed({ id, type: 'down', x, y, t, start });
  };
  const move = input('move');
  const up = input('up');
  const cancel = input('cancel');
  type Point = { readonly x: number; readonly y: number };
  /** Moves pointers in even steps, one every 16ms, from → to over t0 → t1. */
  const drag = (
    paths: Record<number, readonly [Point, Point]>,
    t0: number,
    t1: number,
  ) => {
    const steps = Math.max(1, Math.round((t1 - t0) / 16));
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      for (const [id, [from, to]] of Object.entries(paths)) {
        move(
          Number(id),
          from.x + (to.x - from.x) * k,
          from.y + (to.y - from.y) * k,
          t0 + (t1 - t0) * k,
        );
      }
    }
  };
  const names = () =>
    events
      .filter((event) => event.kind !== 'touch')
      .map((event) =>
        event.kind === 'tap'
          ? `tap${event.count === 2 ? ':double' : ''}`
          : `${event.kind}:${event.phase}`,
      );
  // Without every move.
  const outcomes = () => names().filter((name) => !name.endsWith(':move'));
  type Of<K> = GestureEvent extends infer E
    ? E extends { readonly kind: infer Kind }
      ? K extends Kind
        ? E
        : never
      : never
    : never;
  const last = <K extends GestureEvent['kind']>(kind: K) =>
    events.findLast((event): event is Of<K> => event.kind === kind);
  const roles = () => engine.inspect().fingers.map((finger) => finger.role);
  /** `{ held: 'moving' }` as `held.moving`. */
  const where = () => {
    const value = engine.inspect().value;
    return typeof value === 'string'
      ? value
      : Object.entries(value)
          .map(([key, child]) => `${key}.${String(child)}`)
          .join(' ');
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
  };
};

const p = (x: number, y: number) => ({ x, y });

describe('deciding on first movement', () => {
  it('decides nothing when fingers land', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.down(2, 300, 300, 40);
    g.advance(1000);
    expect(g.names()).toEqual([]);
    expect(g.roles()).toEqual(['pending', 'pending']);
    expect(g.where()).toBe('pressing.down');
  });

  it('pans one finger, with no Hold', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.move(1, 105, 300, 16);
    expect(g.names()).toEqual([]);
    g.drag({ 1: [p(105, 300), p(160, 320)] }, 16, 96);
    expect(g.roles()).toEqual(['acting']);
    g.up(1, 160, 320, 100);
    expect(g.outcomes()).toEqual(['pan:start', 'pan:end']);
    expect(g.last('pan')).toMatchObject({
      fingers: 1,
      hold: undefined,
      offset: { x: 60, y: 20 },
    });
  });

  it('locks the finger down longest as the Hold when it stayed still while another moved', () => {
    const g = setup();
    g.down(1, 100, 300, 0);
    g.move(1, 103, 301, 20);
    g.down(2, 300, 300, 400);
    g.drag({ 2: [p(300, 300), p(300, 200)] }, 400, 500);
    expect(g.outcomes()).toEqual(['hold:lock', 'pan:start']);
    expect(g.last('hold')).toEqual({
      kind: 'hold',
      phase: 'lock',
      side: 'left',
      point: { x: 103, y: 301 },
    });
    expect(g.last('pan')).toMatchObject({
      fingers: 1,
      hold: { side: 'left' },
    });
    expect(g.roles()).toEqual(['hold', 'acting']);
    expect(g.where()).toBe('held.moving');
  });

  it('reads a Hold on the right of the acting fingers as a right Hold', () => {
    const g = setup();
    g.down(1, 300, 300, 0);
    g.down(2, 100, 300, 30);
    g.drag({ 2: [p(100, 300), p(100, 200)] }, 30, 130);
    expect(g.last('hold')?.side).toBe('right');
  });

  it('locks a Hold under two acting fingers, three down in all', () => {
    const pinch = setup();
    pinch.down(1, 50, 400, 0);
    pinch.down(2, 200, 300, 100);
    pinch.down(3, 300, 300, 110);
    pinch.drag(
      { 2: [p(200, 300), p(150, 300)], 3: [p(300, 300), p(350, 300)] },
      110,
      200,
    );
    expect(pinch.outcomes()).toEqual(['hold:lock', 'pinch:start']);
    expect(pinch.last('pinch')).toMatchObject({
      fingers: 2,
      hold: { side: 'left' },
      origin: { x: 250, y: 300 },
    });
    expect(pinch.last('pinch')?.scale).toBeCloseTo(2);
    expect(pinch.roles()).toEqual(['hold', 'acting', 'acting']);

    const pan = setup();
    pan.down(1, 400, 400, 0);
    pan.down(2, 200, 300, 100);
    pan.down(3, 250, 300, 110);
    pan.drag(
      { 2: [p(200, 300), p(200, 200)], 3: [p(250, 300), p(250, 200)] },
      110,
      200,
    );
    expect(pan.outcomes()).toEqual(['hold:lock', 'pan:start']);
    expect(pan.last('pan')).toMatchObject({
      fingers: 2,
      hold: { side: 'right' },
      offset: { x: 0, y: -100 },
    });
  });

  it('pinches two fingers moving apart, and pans two moving together', () => {
    const pinch = setup();
    pinch.down(1, 200, 300, 0);
    pinch.down(2, 300, 300, 10);
    pinch.drag(
      { 1: [p(200, 300), p(150, 300)], 2: [p(300, 300), p(350, 300)] },
      10,
      100,
    );
    expect(pinch.outcomes()).toEqual(['pinch:start']);
    expect(pinch.last('pinch')).toMatchObject({ fingers: 2, hold: undefined });
    expect(pinch.last('pinch')?.scale).toBeCloseTo(2);

    const pan = setup();
    pan.down(1, 200, 300, 0);
    pan.down(2, 300, 300, 10);
    pan.drag(
      { 1: [p(200, 300), p(260, 300)], 2: [p(300, 300), p(360, 305)] },
      10,
      100,
    );
    expect(pan.outcomes()).toEqual(['pan:start']);
    expect(pan.last('pan')).toMatchObject({ fingers: 2, hold: undefined });
  });

  it('pans two fingers whose frame arrives later finger first, and locks no Hold', () => {
    // Chrome reports the second finger's move of a frame before the first's.
    const g = setup();
    g.down(1, 165, 395, 0);
    g.down(2, 225, 395, 20);
    for (let step = 1; step <= 6; step++) {
      g.move(2, 225, 395 + 14 * step, 40 + 32 * step);
      g.move(1, 165, 395 + 14 * step, 40 + 32 * step);
    }
    g.up(1, 165, 479, 260);
    g.up(2, 225, 479, 270);
    expect(g.outcomes()).toEqual(['pan:start', 'pan:end']);
    expect(g.last('pan')).toMatchObject({ fingers: 2, hold: undefined });
  });

  it('still locks a still finger as the Hold, one move later', () => {
    const g = setup();
    g.down(1, 50, 300, 0);
    g.down(2, 300, 300, 400);
    g.move(2, 300, 286, 420);
    expect(g.outcomes()).toEqual([]);
    g.move(2, 300, 272, 436);
    expect(g.outcomes()).toEqual(['hold:lock', 'pan:start']);
  });

  it('pinches when the finger down longest moves too, however slightly first', () => {
    const g = setup();
    g.down(1, 200, 300, 0);
    g.down(2, 300, 300, 30);
    g.move(1, 194, 300, 40);
    g.move(2, 311, 300, 40);
    expect(g.outcomes()).toEqual(['pinch:start']);
  });

  it('ignores three fingers all moving, and a fourth finger', () => {
    const three = setup();
    three.down(1, 100, 300, 0);
    three.down(2, 200, 300, 5);
    three.down(3, 300, 300, 10);
    three.drag(
      {
        1: [p(100, 300), p(100, 200)],
        2: [p(200, 300), p(200, 200)],
        3: [p(300, 300), p(300, 200)],
      },
      10,
      100,
    );
    expect(three.names()).toEqual([]);
    expect(three.where()).toBe('ignoring');

    const four = setup();
    for (const id of [1, 2, 3, 4]) four.down(id, id * 60, 300, id * 10);
    expect(four.where()).toBe('ignoring');
  });

  it('does nothing for a movement nobody registered, but still Captures two fingers', () => {
    const g = setup({});
    g.down(1, 200, 300, 0);
    g.down(2, 300, 300, 10);
    g.drag(
      { 1: [p(200, 300), p(150, 300)], 2: [p(300, 300), p(350, 300)] },
      10,
      100,
    );
    expect(g.names()).toEqual([]);
    expect(g.engine.captured()).toBe(true);
  });
});

describe('locked until lift', () => {
  it('keeps a Pinch a Pinch when the fingers then move together', () => {
    const g = setup();
    g.down(1, 200, 300, 0);
    g.down(2, 300, 300, 10);
    g.drag(
      { 1: [p(200, 300), p(150, 300)], 2: [p(300, 300), p(350, 300)] },
      10,
      100,
    );
    g.drag(
      { 1: [p(150, 300), p(150, 100)], 2: [p(350, 300), p(350, 100)] },
      100,
      200,
    );
    expect(new Set(g.names())).toEqual(new Set(['pinch:start', 'pinch:move']));
    expect(g.last('pinch')?.point).toEqual({ x: 250, y: 100 });
  });

  it('ends a two-finger gesture when one of its fingers lifts, and ignores the other', () => {
    const g = setup();
    g.down(1, 200, 300, 0);
    g.down(2, 300, 300, 10);
    g.drag(
      { 1: [p(200, 300), p(150, 300)], 2: [p(300, 300), p(350, 300)] },
      10,
      100,
    );
    g.up(1, 150, 300, 110);
    g.drag({ 2: [p(350, 300), p(350, 100)] }, 110, 200);
    expect(g.outcomes()).toEqual(['pinch:start', 'pinch:end']);
    expect(g.where()).toBe('ignoring');
    g.up(2, 350, 100, 210);
    expect(g.where()).toBe('idle');
  });

  it('keeps the Hold for gesture after gesture, each classified afresh', () => {
    const g = setup({ ...EVERYTHING, doubleTap: [] });
    g.down(1, 50, 300, 0);
    g.down(2, 300, 300, 400);
    // A tap: the Hold has been down long enough to lock at once.
    g.up(2, 300, 300, 450);
    // A pan.
    g.down(2, 300, 300, 1000);
    g.drag({ 2: [p(300, 300), p(300, 200)] }, 1000, 1100);
    g.up(2, 300, 200, 1116);
    // A Pinch of two acting fingers.
    g.down(2, 200, 300, 1500);
    g.down(3, 300, 300, 1510);
    g.drag(
      { 2: [p(200, 300), p(180, 300)], 3: [p(300, 300), p(320, 300)] },
      1510,
      1600,
    );
    g.up(2, 180, 300, 1610);
    g.up(3, 320, 300, 1620);
    expect(g.outcomes()).toEqual([
      'hold:lock',
      'tap',
      'pan:start',
      'pan:end',
      'pinch:start',
      'pinch:end',
    ]);
    for (const event of g.events) {
      if (
        event.kind === 'tap' ||
        event.kind === 'pan' ||
        event.kind === 'pinch'
      ) {
        expect(event.hold?.side).toBe('left');
      }
    }
    expect(g.where()).toBe('held.idle');
    expect(g.roles()).toEqual(['hold']);
  });

  it('releases the Hold when it lifts, ending the gesture under way so a flick still coasts', () => {
    const g = setup();
    g.down(1, 50, 300, 0);
    g.down(2, 300, 300, 100);
    g.drag({ 2: [p(300, 300), p(300, 200)] }, 100, 200);
    g.up(1, 50, 300, 205);
    expect(g.outcomes()).toEqual([
      'hold:lock',
      'pan:start',
      'pan:end',
      'hold:release',
    ]);
    expect(g.last('pan')?.velocity.y).toBeLessThan(-0.5);
    expect(g.roles()).toEqual(['free']);
    expect(g.engine.captured()).toBe(true);
  });

  it(`cancels the Hold and what it modifies when it drifts past ${HOLD_DRIFT_PX}px`, () => {
    const g = setup();
    g.down(1, 50, 300, 0);
    g.down(2, 300, 300, 100);
    g.drag({ 2: [p(300, 300), p(300, 250)] }, 100, 150);
    g.move(1, 50, 300 + HOLD_DRIFT_PX, 160);
    expect(g.last('hold')?.phase).toBe('lock');
    g.move(1, 50, 301 + HOLD_DRIFT_PX, 170);
    expect(g.outcomes()).toEqual([
      'hold:lock',
      'pan:start',
      'pan:cancel',
      'hold:cancel',
    ]);
    const before = g.events.length;
    g.drag({ 2: [p(300, 250), p(200, 250)] }, 170, 220);
    g.up(2, 200, 250, 230);
    expect(g.events.length).toBe(before);
  });
});

describe('taps', () => {
  it('fires a tap on lift when no double tap is registered', () => {
    const g = setup({});
    g.down(1, 100, 100, 0);
    g.up(1, 102, 101, 80);
    expect(g.names()).toEqual(['tap']);
    expect(g.last('tap')).toEqual({
      kind: 'tap',
      count: 1,
      fingers: 1,
      hold: undefined,
      point: { x: 102, y: 101 },
    });
  });

  it('waits out a double tap only when one is registered for that combination', () => {
    const g = setup({ doubleTap: ['1:none'] });
    g.down(1, 100, 100, 0);
    g.up(1, 100, 100, 60);
    expect(g.names()).toEqual([]);
    g.advance(60 + DOUBLE_TAP_GAP_MS);
    expect(g.names()).toEqual(['tap']);

    // A two-finger tap has no double tap registered: it fires at once.
    g.down(1, 100, 100, 1000);
    g.down(2, 200, 100, 1010);
    g.up(1, 100, 100, 1060);
    g.up(2, 200, 100, 1070);
    expect(g.names()).toEqual(['tap', 'tap']);
    expect(g.last('tap')).toMatchObject({
      fingers: 2,
      point: { x: 150, y: 100 },
    });
  });

  it('makes two quick taps in one place a double tap, with no single tap', () => {
    const g = setup({ doubleTap: ['1:none'] });
    g.down(1, 100, 100, 0);
    g.up(1, 100, 100, 60);
    g.down(1, 104, 98, 180);
    g.up(1, 104, 98, 240);
    g.advance(2000);
    expect(g.names()).toEqual(['tap:double']);
  });

  it('gives two taps when the second comes too late, too far away or held too long', () => {
    const g = setup({ doubleTap: ['1:none'] });
    g.down(1, 100, 100, 0);
    g.up(1, 100, 100, 60);
    g.down(1, 100, 100, 500);
    g.up(1, 100, 100, 560);
    g.down(1, 250, 100, 700);
    g.up(1, 250, 100, 760);
    g.advance(3000);
    expect(g.names()).toEqual(['tap', 'tap', 'tap']);
    g.down(1, 100, 100, 4000);
    g.up(1, 100, 100, 4050);
    g.down(1, 100, 100, 4150);
    g.advance(4150 + TAP_MAX_MS + 1);
    expect(g.names()).toEqual(['tap', 'tap', 'tap', 'tap']);
    g.up(1, 100, 100, 5000);
    expect(g.names()).toHaveLength(4);
  });

  it('is nothing when held too long, however long', () => {
    const g = setup({});
    g.down(1, 100, 100, 0);
    g.up(1, 100, 100, TAP_MAX_MS + 50);
    g.advance(2000);
    expect(g.names()).toEqual([]);
  });

  it('makes a two-finger tap when both lift within the tap time of the first landing', () => {
    const g = setup({});
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 100);
    g.up(1, 100, 100, 150);
    expect(g.names()).toEqual([]);
    expect(g.where()).toBe('pressing.waiting');
    g.up(2, 200, 100, 250);
    expect(g.names()).toEqual(['tap']);
    expect(g.last('tap')).toMatchObject({ fingers: 2, hold: undefined });
  });

  it('makes a two-finger double tap', () => {
    const g = setup({ doubleTap: ['2:none'] });
    for (const t of [0, 250]) {
      g.down(1, 100, 100, t);
      g.down(2, 200, 100, t + 10);
      g.up(1, 100, 100, t + 60);
      g.up(2, 200, 100, t + 70);
    }
    g.advance(2000);
    expect(g.names()).toEqual(['tap:double']);
    expect(g.last('tap')).toMatchObject({ fingers: 2, count: 2 });
  });

  it('taps with a Hold at once when the finger staying has been down the tap time already', () => {
    const g = setup({});
    g.down(1, 300, 300, 0);
    g.down(2, 100, 300, 500);
    g.up(2, 100, 300, 560);
    expect(g.outcomes()).toEqual(['hold:lock', 'tap']);
    expect(g.last('tap')).toMatchObject({
      fingers: 1,
      hold: { side: 'right', point: { x: 300, y: 300 } },
      point: { x: 100, y: 300 },
    });
    expect(g.where()).toBe('held.idle');
    expect(g.engine.captured()).toBe(true);
  });

  it('waits on a young finger staying: the tap time running out makes it the Hold', () => {
    const g = setup({});
    g.down(1, 100, 300, 0);
    g.down(2, 300, 300, 100);
    g.up(1, 100, 300, 150);
    g.advance(TAP_MAX_MS - 1);
    expect(g.names()).toEqual([]);
    g.advance(TAP_MAX_MS);
    expect(g.outcomes()).toEqual(['hold:lock', 'tap']);
    expect(g.last('tap')).toMatchObject({
      fingers: 1,
      hold: { side: 'right' },
      point: { x: 100, y: 300 },
    });
    expect(g.roles()).toEqual(['hold']);
  });

  it('taps two fingers beside a finger held the tap time, before any Hold locked', () => {
    const g = setup(EVERYTHING);
    g.down(9, 60, 400, 0);
    g.down(1, 200, 300, 350);
    g.down(2, 260, 300, 360);
    g.up(1, 200, 300, 410);
    g.up(2, 260, 300, 420);
    g.advance(800);
    expect(g.outcomes()).toEqual(['hold:lock', 'tap']);
    expect(g.last('tap')).toMatchObject({ fingers: 2, hold: { side: 'left' } });
  });

  it('taps one and two acting fingers under a Hold, and double taps', () => {
    const g = setup({ ...EVERYTHING, doubleTap: ['1:left'] });
    g.down(1, 50, 300, 0);
    g.down(2, 300, 300, 400);
    g.drag({ 2: [p(300, 300), p(300, 200)] }, 400, 450);
    g.up(2, 300, 200, 460);
    // A two-finger tap under the Hold.
    g.down(2, 200, 300, 1000);
    g.down(3, 300, 300, 1020);
    g.up(2, 200, 300, 1080);
    g.up(3, 300, 300, 1100);
    // A double tap under the Hold.
    g.down(2, 250, 300, 1500);
    g.up(2, 250, 300, 1550);
    g.down(2, 252, 300, 1650);
    g.up(2, 252, 300, 1700);
    g.advance(2500);
    expect(g.outcomes()).toEqual([
      'hold:lock',
      'pan:start',
      'pan:end',
      'tap',
      'tap:double',
    ]);
    expect(g.events.filter((event) => event.kind === 'tap')).toMatchObject([
      { fingers: 2, count: 1, hold: { side: 'left' } },
      { fingers: 1, count: 2, hold: { side: 'left' } },
    ]);
  });
});

describe('swipe', () => {
  it('locks to the dominant direction of the first movement', () => {
    const g = setup({ swipe: { '1:none': ['up', 'down', 'left', 'right'] } });
    g.down(1, 200, 200, 0);
    g.drag({ 1: [p(200, 200), p(230, 290)] }, 0, 80);
    g.drag({ 1: [p(230, 290), p(400, 290)] }, 80, 160);
    g.up(1, 400, 290, 170);
    expect(g.outcomes()).toEqual(['swipe:start', 'swipe:end']);
    expect(g.last('swipe')?.direction).toBe('down');
  });

  it('claims only directions a Swipe is registered for', () => {
    const g = setup({ swipe: { '1:none': ['right'] } });
    g.down(1, 200, 200, 0);
    g.drag({ 1: [p(200, 200), p(100, 200)] }, 0, 80);
    expect(g.names()).toEqual([]);
    expect(g.where()).toBe('ignoring');
  });

  it('passes the edge strip a touch started in to the policy', () => {
    const g = setup({ swipe: { '1:none': ['left'] }, edge: ['right'] });
    const edge: TouchStart = { edge: 'left', ends: [] };
    g.down(1, 10, 200, 0, edge);
    g.drag({ 1: [p(10, 200), p(100, 200)] }, 0, 80);
    expect(g.outcomes()).toEqual(['swipe:start']);
    g.up(1, 100, 200, 90);
    g.down(1, 10, 200, 1000, edge);
    g.drag({ 1: [p(10, 200), p(0, 200)] }, 1000, 1080);
    expect(g.outcomes()).toEqual(['swipe:start', 'swipe:end']);
  });
});

describe('scroll axis', () => {
  it('leaves one finger along the scroll axis to the browser, and claims the other axis', () => {
    const g = setup({ pan: ['1:none'] }, 'y');
    g.down(1, 100, 300, 0);
    g.drag({ 1: [p(100, 300), p(104, 250)] }, 0, 64);
    expect(g.where()).toBe('native');
    expect(g.engine.captured()).toBe(false);
    g.up(1, 104, 250, 70);
    g.down(1, 100, 300, 1000);
    g.drag({ 1: [p(100, 300), p(160, 304)] }, 1000, 1064);
    expect(g.outcomes()).toEqual(['pan:start']);
  });

  it('claims a Swipe along the axis where the scroller cannot scroll, and only there', () => {
    const top: TouchStart = { edge: undefined, ends: ['down'] };
    const g = setup({ swipe: { '1:none': ['down'] }, pan: [] }, 'y');
    g.down(1, 100, 300, 0, top);
    g.drag({ 1: [p(100, 300), p(100, 380)] }, 0, 80);
    expect(g.outcomes()).toEqual(['swipe:start']);
    expect(g.engine.captured()).toBe(true);
    g.up(1, 100, 380, 90);
    // Mid-list the same swipe scrolls.
    g.down(1, 100, 300, 1000, { edge: undefined, ends: [] });
    g.drag({ 1: [p(100, 300), p(100, 380)] }, 1000, 1080);
    expect(g.where()).toBe('native');
  });

  it('never gives a Pan the scroll-end exception', () => {
    const g = setup({ pan: ['1:none'] }, 'y');
    g.down(1, 100, 300, 0, { edge: undefined, ends: ['down', 'up'] });
    g.drag({ 1: [p(100, 300), p(100, 380)] }, 0, 80);
    expect(g.where()).toBe('native');
  });

  it('holds the browser back from a finger still inside the slop heading for such a Swipe', () => {
    const g = setup({ swipe: { '1:none': ['down'] } }, 'y');
    g.down(1, 100, 300, 0, { edge: undefined, ends: ['down'] });
    g.move(1, 100, 304, 16);
    expect(g.engine.captured()).toBe(true);
    g.move(1, 100, 296, 32);
    expect(g.engine.captured()).toBe(false);
  });
});

describe('Capture', () => {
  it('starts as soon as two fingers are down, and lasts until every finger lifts', () => {
    const g = setup({}, 'y');
    g.down(1, 100, 300, 0);
    expect(g.engine.captured()).toBe(false);
    g.down(2, 200, 300, 500);
    expect(g.engine.captured()).toBe(true);
    g.up(2, 200, 300, 1000);
    expect(g.engine.captured()).toBe(true);
    g.up(1, 100, 300, 1100);
    expect(g.engine.captured()).toBe(false);
  });
});

describe('release velocity', () => {
  it('is the flick when the fingers lift moving', () => {
    const g = setup();
    g.down(1, 300, 300, 0);
    g.drag({ 1: [p(300, 300), p(200, 300)] }, 0, 100);
    g.up(1, 200, 300, 110);
    expect(g.last('pan')?.velocity.x).toBeLessThan(-0.5);
  });

  it('is 0 when the fingers were held still before lifting', () => {
    const g = setup();
    g.down(1, 300, 300, 0);
    g.drag({ 1: [p(300, 300), p(200, 300)] }, 0, 100);
    g.up(1, 200, 300, 260);
    expect(g.last('pan')).toMatchObject({
      phase: 'end',
      velocity: { x: 0, y: 0 },
    });
  });

  it("is the gesture's own fingers', not the Hold's", () => {
    const g = setup();
    g.down(1, 50, 300, 0);
    g.down(2, 300, 300, 100);
    g.drag({ 2: [p(300, 300), p(300, 200)] }, 100, 200);
    g.drag({ 1: [p(50, 300), p(60, 300)] }, 250, 330);
    g.up(2, 300, 200, 340);
    expect(g.last('pan')).toMatchObject({
      phase: 'end',
      velocity: { x: 0, y: 0 },
    });
  });
});

describe('touches', () => {
  it('are announced as the first finger lands and the last lifts', () => {
    const g = setup({});
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 10);
    g.up(1, 100, 100, 400);
    g.up(2, 200, 100, 410);
    expect(
      g.events
        .filter((event) => event.kind === 'touch')
        .map((event) => event.phase),
    ).toEqual(['start', 'end']);
  });

  it('cancel a gesture the platform takes', () => {
    const g = setup();
    g.down(1, 50, 300, 0);
    g.drag({ 1: [p(50, 300), p(120, 300)] }, 0, 64);
    g.cancel(1, 120, 300, 80);
    expect(g.outcomes()).toEqual(['pan:start', 'pan:cancel']);
  });

  it('cancelAll acts like the platform taking every pointer', () => {
    const g = setup();
    g.down(1, 50, 300, 0);
    g.down(2, 300, 300, 100);
    g.drag({ 2: [p(300, 300), p(250, 300)] }, 100, 164);
    g.engine.cancelAll();
    expect(g.outcomes()).toEqual([
      'hold:lock',
      'pan:start',
      'pan:cancel',
      'hold:cancel',
    ]);
    expect(g.engine.inspect().fingers).toEqual([]);
    expect(g.engine.captured()).toBe(false);
  });
});
