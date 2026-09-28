import { type MotionValue, useMotionValue } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Point } from '../gesture-reading';
import type { Hold } from '../hold-reading';
import type { Axis, SwipeEnd } from '../swipe-reading';
import type { GestureEnd, Tap } from './hub';
import { useZone } from './zone';

// The latest options, read by the zone mid-Gesture without re-registering.
const useLatest = <T>(value: T) => {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
};

/** The Hold a listener takes Gestures under: only that one, `none` by default. */
const holdOf = (options: { readonly hold?: Hold }): Hold =>
  options.hold ?? 'none';

export type GestureOptions = {
  /** Whether it takes the next Gesture: true by default. Read as each Gesture starts. */
  readonly enabled?: boolean;
  /** Only Gestures under this Hold: `none`, with no Hold, by default. */
  readonly hold?: Hold;
  readonly onEnd?: (end: GestureEnd) => void;
};

export type GestureState = {
  /** Movement in px since the Gesture started. */
  readonly x: MotionValue<number>;
  readonly y: MotionValue<number>;
  /** A multiplier: 1 unchanged, 2 twice as large. */
  readonly scale: MotionValue<number>;
  /** Degrees, clockwise positive. */
  readonly rotation: MotionValue<number>;
  /**
   * Where the current or last Gesture started, in viewport px: the point
   * scale and rotation turn about. None before the first.
   */
  readonly origin: Point | undefined;
  /** True from the first finger landing until the last one lifts. */
  readonly active: boolean;
};

/**
 * Reads every Gesture in the zone under its Hold, one or two fingers, as
 * motion values relative to where it started: x and y move with the point
 * under the first finger, and a second finger also scales and rotates about
 * it. Applied about `origin`, they keep what was under the fingers under
 * them. They keep their last values after the fingers lift and start again
 * from 0 (scale 1) with the next Gesture. They have no bounds; what they
 * mean is up to the caller.
 */
export function useGesture(options: GestureOptions = {}): GestureState {
  const hub = useZone('useGesture');
  const latest = useLatest(options);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const rotation = useMotionValue(0);
  const [active, setActive] = useState(false);
  const [origin, setOrigin] = useState<Point | undefined>(undefined);

  useEffect(
    () =>
      hub.addGesture({
        enabled: () => latest.current.enabled !== false,
        hold: () => holdOf(latest.current),
        begin: (start) => {
          x.jump(0);
          y.jump(0);
          scale.jump(1);
          rotation.jump(0);
          setOrigin(start);
          setActive(true);
        },
        update: (values) => {
          x.set(values.x);
          y.set(values.y);
          scale.set(values.scale);
          rotation.set(values.rotation);
        },
        finish: (end) => {
          setActive(false);
          latest.current.onEnd?.(end);
        },
      }),
    [hub, latest, x, y, scale, rotation],
  );

  return { x, y, scale, rotation, origin, active };
}

export type SwipeOptions = {
  /** Whether it takes the next Swipe: true by default. Read as each Swipe starts. */
  readonly enabled?: boolean;
  /** Only Swipes under this Hold: `none`, with no Hold, by default. */
  readonly hold?: Hold;
  /** Only Swipes along this axis; either by default. */
  readonly axis?: Axis;
  readonly onEnd?: (end: SwipeEnd) => void;
};

export type SwipeState = {
  /** The axis of the current or last Swipe, none before the first. */
  readonly axis: Axis | undefined;
  /** Signed px along the Swipe's axis: right and down are positive. The other stays 0. */
  readonly dx: MotionValue<number>;
  readonly dy: MotionValue<number>;
  /** True from the move that fixes the axis until the finger lifts or a second one lands. */
  readonly active: boolean;
};

/**
 * Reads every Swipe in the zone under its Hold: one finger moving along one
 * axis, fixed by its first real movement, as a signed distance in px. A
 * second finger, or the browser taking the touch, ends it with
 * `interrupted` in `onEnd`. `dx` and `dy` keep their last values until the
 * next Swipe starts. It judges nothing; what a Swipe does is up to the
 * caller.
 */
export function useSwipe(options: SwipeOptions = {}): SwipeState {
  const hub = useZone('useSwipe');
  const latest = useLatest(options);
  const dx = useMotionValue(0);
  const dy = useMotionValue(0);
  const [axis, setAxis] = useState<Axis | undefined>(undefined);
  const [active, setActive] = useState(false);

  useEffect(
    () =>
      hub.addSwipe({
        enabled: () => latest.current.enabled !== false,
        hold: () => holdOf(latest.current),
        axis: () => latest.current.axis,
        begin: (next) => {
          dx.jump(0);
          dy.jump(0);
          setAxis(next);
          setActive(true);
        },
        update: (along, distance) => {
          (along === 'x' ? dx : dy).set(distance);
        },
        finish: (end) => {
          setActive(false);
          latest.current.onEnd?.(end);
        },
      }),
    [hub, latest, dx, dy],
  );

  return { axis, dx, dy, active };
}

export type TapOptions = {
  /** Whether it takes the next Tap: true by default. Read as each Tap lands. */
  readonly enabled?: boolean;
  /** Only Taps under this Hold: `none`, with no Hold, by default. */
  readonly hold?: Hold;
  readonly onTap: (tap: Tap) => void;
};

/**
 * Reads every Tap in the zone: one finger touching and lifting without
 * moving. It fires as the finger lifts. With no Hold, what is under the
 * finger is still clicked as usual; under a Hold, nothing is.
 */
export function useTap(options: TapOptions): void {
  const hub = useZone('useTap');
  const latest = useLatest(options);

  useEffect(
    () =>
      hub.addTap({
        enabled: () => latest.current.enabled !== false,
        hold: () => holdOf(latest.current),
        tap: (tap) => latest.current.onTap(tap),
      }),
    [hub, latest],
  );
}
