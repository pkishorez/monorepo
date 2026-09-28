import { createVelocityTracker } from './velocity';

export type Point = { readonly x: number; readonly y: number };

/** One finger's position in viewport px at time `t` in ms. */
export type FingerSample = Point & { readonly id: number; readonly t: number };

/**
 * A Gesture relative to where it started: x and y are how far the point
 * under the first finger has moved, in px; scale is a multiplier and
 * rotation is in degrees, clockwise positive, both about that point. Moving,
 * then scaling and rotating something about the Gesture's origin keeps what
 * was under the fingers under them.
 */
export type GestureValues = {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
};

export const UNMOVED: GestureValues = { x: 0, y: 0, scale: 1, rotation: 0 };

// Where the followed fingers are: the point between them, how far apart they
// are and the angle of the line through them. One finger has no span or angle.
type Shape = {
  readonly centre: Point;
  readonly span: number;
  readonly angle: number;
};

const shapeOf = (fingers: ReadonlyArray<Point>): Shape => {
  const [a, b] = fingers;
  if (b === undefined) return { centre: a, span: 0, angle: 0 };
  return {
    centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    span: Math.hypot(b.x - a.x, b.y - a.y),
    angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
  };
};

// The shortest turn from one angle to another, so crossing ±180° is not a
// full turn back.
const turnBetween = (from: number, to: number) => {
  const turn = (to - from) % 360;
  if (turn > 180) return turn - 360;
  if (turn <= -180) return turn + 360;
  return turn;
};

/**
 * Reads one continuous Gesture from the fingers down, from the first landing
 * to the last lifting. The first two fingers down are followed: one moves
 * the Gesture, two also scale and rotate it. When a finger joins or leaves,
 * the Gesture carries on from its values at that moment, so nothing jumps.
 */
export const createGestureReading = () => {
  const fingers = new Map<number, Point>();
  const speeds = createVelocityTracker();
  let values = UNMOVED;
  let origin: Point = { x: 0, y: 0 };
  // The values and finger shape as the current set of fingers took over.
  let base = UNMOVED;
  let anchor: Shape | undefined;
  let angle = 0;
  let turned = 0;

  const followed = () => [...fingers.values()].slice(0, 2);

  const rebase = () => {
    base = values;
    anchor = fingers.size === 0 ? undefined : shapeOf(followed());
    angle = anchor?.angle ?? 0;
    turned = 0;
  };

  // Since the current fingers took over, they moved their centre, and
  // scaled and turned about it. The origin, where it had got to by then, goes
  // with them.
  const measure = (from: Shape): GestureValues => {
    const now = shapeOf(followed());
    const pinching = fingers.size >= 2 && from.span >= 1;
    if (pinching) {
      turned += turnBetween(angle, now.angle);
      angle = now.angle;
    }
    const grown = pinching ? now.span / from.span : 1;
    const radians = (turned * Math.PI) / 180;
    const cos = Math.cos(radians) * grown;
    const sin = Math.sin(radians) * grown;
    const qx = origin.x + base.x - from.centre.x;
    const qy = origin.y + base.y - from.centre.y;
    return {
      x: now.centre.x + cos * qx - sin * qy - origin.x,
      y: now.centre.y + sin * qx + cos * qy - origin.y,
      scale: base.scale * grown,
      rotation: base.rotation + turned,
    };
  };

  return {
    /** Whether a finger is down: the Gesture is under way. */
    active: () => fingers.size > 0,
    fingers: () => fingers.size,
    values: () => values,
    /** Where the first finger landed, in viewport px. */
    origin: () => origin,
    /** How fast each value is changing per second at `t`. */
    velocity: (t: number) => speeds.at(t),
    /** A finger lands; `start` when it begins a new Gesture. */
    down: (finger: FingerSample): 'start' | 'join' => {
      const starts = fingers.size === 0;
      if (starts) {
        values = UNMOVED;
        origin = { x: finger.x, y: finger.y };
        speeds.reset();
      }
      fingers.set(finger.id, { x: finger.x, y: finger.y });
      rebase();
      speeds.add(values, finger.t);
      return starts ? 'start' : 'join';
    },
    /** A finger moves; the Gesture's new values, or none for an unknown finger. */
    move: (finger: FingerSample): GestureValues | undefined => {
      if (!fingers.has(finger.id) || anchor === undefined) return undefined;
      fingers.set(finger.id, { x: finger.x, y: finger.y });
      values = measure(anchor);
      speeds.add(values, finger.t);
      return values;
    },
    /** A finger lifts; `end` when it was the last, which ends the Gesture. */
    up: (id: number): 'end' | 'leave' | undefined => {
      if (!fingers.delete(id)) return undefined;
      rebase();
      return fingers.size === 0 ? 'end' : 'leave';
    },
  };
};

export type GestureReading = ReturnType<typeof createGestureReading>;
