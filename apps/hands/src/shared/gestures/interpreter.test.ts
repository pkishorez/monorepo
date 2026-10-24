import { describe, expect, it } from 'vitest';
import type { Fired, Frame, Point, RawHand } from './hand.ts';
import { Interpreter } from './interpreter.ts';

/*
 * Synthetic hands, built in meters from the wrist up (y grows downward, as
 * on screen), placed in the image at `at` and scaled by `scale`. `at` is
 * where the hand shows on screen, mirrored; the hand is handed to the
 * Interpreter unmirrored, as MediaPipe gives it.
 */

type Pose = {
  readonly fingers?: readonly [boolean, boolean, boolean, boolean, boolean];
  readonly pinch?: 'index' | 'middle';
  readonly at?: { readonly x: number; readonly y: number };
  readonly scale?: number;
  /** Degrees the hand is turned about the wrist. */
  readonly roll?: number;
  readonly shape?: string;
};

const KNUCKLES = [
  [-0.03, -0.09],
  [0, -0.09],
  [0.02, -0.085],
  [0.04, -0.075],
] as const;

const worldOf = ({
  fingers = [true, true, true, true, true],
  pinch,
}: Pose): Array<Point> => {
  const p = (x: number, y: number, z = 0): Point => ({ x, y, z });
  const points: Array<Point> = [
    p(0, 0),
    p(-0.03, -0.02),
    p(-0.05, -0.04),
    p(-0.07, -0.06),
  ];
  points.push(fingers[0] ? p(-0.09, -0.08) : p(-0.01, -0.06));
  KNUCKLES.forEach(([x, y], i) => {
    const out = fingers[i + 1];
    points.push(p(x, y), p(x, y - 0.03));
    points.push(out ? p(x, y - 0.05) : p(x, y - 0.015, 0.02));
    points.push(out ? p(x, y - 0.07) : p(x, y + 0.01, 0.03));
  });
  if (pinch !== undefined) {
    const tip = points[pinch === 'index' ? 8 : 12]!;
    points[4] = p(tip.x + 0.005, tip.y + 0.005);
  }
  return points;
};

const handOf = (pose: Pose = {}): RawHand => {
  const world = worldOf(pose);
  const { at = { x: 0.5, y: 0.6 }, scale = 2, roll = 0 } = pose;
  const r = (roll * Math.PI) / 180;
  const points = world.map(({ x, y, z }) => {
    const rx = x * Math.cos(r) - y * Math.sin(r);
    const ry = x * Math.sin(r) + y * Math.cos(r);
    // On screen at `at`, then unmirrored, as the camera sees it.
    return { x: 1 - (at.x + rx * scale), y: at.y + ry * scale, z };
  });
  return {
    points,
    world,
    handedness: { label: 'Left', score: 0.9 },
    shape: { name: pose.shape ?? 'None', score: 0.9 },
  };
};

const frame = (at: number, ...hands: Array<RawHand>): Frame => ({
  at,
  aspect: 1,
  hands,
});

/** Runs frames 33 ms apart and collects every gesture fired. */
const run = (
  poses: ReadonlyArray<ReadonlyArray<Pose>>,
  interpreter = new Interpreter(),
) => {
  const fired: Array<Fired> = [];
  const readings = poses.map((hands, i) => {
    const step = interpreter.step(frame(i * 33, ...hands.map(handOf)), {
      smoothing: false,
    });
    fired.push(...step.fired);
    return step.reading;
  });
  return { fired, readings, names: fired.map((f) => f.gesture) };
};

const times = <A>(n: number, pose: A): Array<A> =>
  Array.from({ length: n }, () => pose);

describe('Interpreter', () => {
  it('counts the fingers out once the count holds', () => {
    const { fired, readings } = run([
      ...times(12, [{}]),
      ...times(12, [{ fingers: [false, true, true, false, false] }]),
    ]);
    expect(readings[0]!.hands[0]!.count).toBe(5);
    expect(
      fired.filter((f) => f.gesture === 'Count').map((f) => f.detail),
    ).toEqual(['5', '2']);
  });

  it('clicks once per pinch, with separate thresholds to start and end it', () => {
    const { names } = run([
      ...times(3, [{}]),
      ...times(5, [{ pinch: 'index' }]),
      ...times(3, [{}]),
      ...times(3, [{ pinch: 'index' }]),
    ]);
    expect(names.filter((n) => n === 'Pinch')).toHaveLength(2);
  });

  it('never pinches a fist, whose thumb rests on its curled fingers', () => {
    const fist = [false, false, false, false, false] as const;
    const { names } = run([
      ...times(3, [{ fingers: fist }]),
      ...times(3, [{ fingers: fist, pinch: 'index' }]),
      ...times(3, [{ fingers: fist, pinch: 'middle' }]),
    ]);
    expect(names).not.toContain('Pinch');
    expect(names).not.toContain('MiddlePinch');
  });

  it('tells a middle pinch from an index pinch', () => {
    const { names } = run([
      ...times(3, [{}]),
      ...times(3, [{ pinch: 'middle' }]),
    ]);
    expect(names).toContain('MiddlePinch');
    expect(names).not.toContain('Pinch');
  });

  it('drags once a pinch moves', () => {
    const moving = Array.from({ length: 6 }, (_, i) => [
      { pinch: 'index' as const, at: { x: 0.4 + i * 0.03, y: 0.6 } },
    ]);
    expect(run([[{ at: { x: 0.4, y: 0.6 } }], ...moving]).names).toContain(
      'Drag',
    );
  });

  it('keeps each hand its letter when MediaPipe swaps their order', () => {
    const left = { at: { x: 0.25, y: 0.6 } };
    const right = { at: { x: 0.75, y: 0.6 } };
    const { readings, names } = run([
      [left, right],
      [right, left],
      [left, right],
    ]);
    const letterAt = (i: number, x: number) =>
      readings[i]!.hands.find((h) => Math.abs(h.points[0]!.x - x) < 0.01)!.id;
    expect([0, 1, 2].map((i) => letterAt(i, 0.25))).toEqual(['A', 'A', 'A']);
    expect([0, 1, 2].map((i) => letterAt(i, 0.75))).toEqual(['B', 'B', 'B']);
    expect(names.filter((n) => n === 'HandIn')).toHaveLength(2);
    expect(names).toContain('TwoHands');
  });

  it('lets a lost hand go only after a grace period', () => {
    const { names } = run([[{}], [], [], [], [], [], [], [], [], []]);
    expect(names.filter((n) => n === 'HandOut')).toHaveLength(1);
    const brief = run([[{}], [], [{}], [{}]]);
    expect(brief.names).not.toContain('HandOut');
    expect(brief.names.filter((n) => n === 'HandIn')).toHaveLength(1);
  });

  it('swipes an open palm the way it sweeps on screen', () => {
    const sweep = Array.from({ length: 8 }, (_, i) => [
      { at: { x: 0.3 + i * 0.05, y: 0.6 } },
    ]);
    expect(run(sweep).names).toContain('SwipeRight');
    const up = Array.from({ length: 8 }, (_, i) => [
      { at: { x: 0.5, y: 0.8 - i * 0.05 } },
    ]);
    expect(run(up).names).toContain('SwipeUp');
  });

  it('pushes when an open palm grows fast', () => {
    const closer = Array.from({ length: 8 }, (_, i) => [
      { scale: 2 + i * 0.15 },
    ]);
    const { names } = run(closer);
    expect(names).toContain('Push');
    expect(names).not.toContain('SwipeDown');
  });

  it('turns the dial with a twisting fist', () => {
    const fist = [false, false, false, false, false] as const;
    const twist = Array.from({ length: 8 }, (_, i) => [
      { fingers: fist, roll: i * 6 },
    ]);
    const { fired, readings } = run(twist);
    expect(fired.find((f) => f.gesture === 'Dial')?.detail).toBe('clockwise');
    expect(readings[2]!.hands[0]!.turn).toBeCloseTo(6);
  });

  it('draws with only the index finger out', () => {
    const point = [false, true, false, false, false] as const;
    const line = Array.from({ length: 8 }, (_, i) => [
      { fingers: point, at: { x: 0.3 + i * 0.04, y: 0.6 } },
    ]);
    const { names, readings } = run(line);
    expect(readings[0]!.hands[0]!.drawing).toBe(true);
    expect(names).toContain('Draw');
  });

  it('fires a model shape once it holds, and never None', () => {
    const { fired } = run([
      ...times(12, [{ shape: 'Thumb_Up' }]),
      ...times(12, [{ shape: 'None' }]),
    ]);
    expect(fired.filter((f) => f.gesture === 'Thumb_Up')).toHaveLength(1);
    expect(fired.find((f) => f.gesture === 'Thumb_Up')?.detail).toBe('90%');
  });

  it('zooms and rotates with both hands pinching', () => {
    const apart = Array.from({ length: 6 }, (_, i) => [
      { pinch: 'index' as const, at: { x: 0.35 - i * 0.03, y: 0.6 } },
      { pinch: 'index' as const, at: { x: 0.65 + i * 0.03, y: 0.6 } },
    ]);
    const zoom = run(apart);
    expect(zoom.fired.find((f) => f.gesture === 'Zoom')?.detail).toBe('in');
    expect(zoom.readings.at(-1)!.twoHands!.scale).toBeGreaterThan(1.25);

    const turn = Array.from({ length: 6 }, (_, i) => [
      { pinch: 'index' as const, at: { x: 0.3, y: 0.6 + i * 0.03 } },
      { pinch: 'index' as const, at: { x: 0.7, y: 0.6 - i * 0.03 } },
    ]);
    expect(run(turn).names).toContain('Rotate');
  });
});
