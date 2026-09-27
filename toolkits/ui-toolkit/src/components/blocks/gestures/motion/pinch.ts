import type { MotionValue } from 'motion';
import type { MovementEvent, Point } from '../engine';
import { clamp, rubberBand, settle } from './springs';

export type PinchOptions = {
  readonly min: number;
  readonly max: number;
  readonly onStart?: (event: PinchUpdate) => void;
  readonly onEnd?: (event: PinchUpdate) => void;
};

/** What a Pinch tells the app as it starts and ends. */
export type PinchUpdate = { readonly scale: number; readonly origin: Point };

// Past min or max the scale gives way by ratio, as a rubber band over a
// doubling: pinching twice past max reaches about 1.35 × max.
const bandScale = (scale: number, min: number, max: number) => {
  if (scale > max) return max * (1 + rubberBand(scale / max - 1, 1));
  if (scale < min && scale > 0)
    return min / (1 + rubberBand(min / scale - 1, 1));
  return scale;
};

/**
 * Drives a Pinch's `scale`: the start scale times the fingers' distance over
 * the one they went down at, rubber-banded past `min` and `max`, springing
 * back inside on release. `originX`/`originY` are where the fingers went
 * down, in px from the zone's top left. Given a Pan's `x` and `y`, it moves
 * them too, so the point that was under the fingers stays under them: that
 * needs the transformed element at the zone's top left, scaling from its own
 * top left. `zone` is the zone's box.
 */
export const createPinch = (
  values: {
    readonly scale: MotionValue<number>;
    readonly originX: MotionValue<number>;
    readonly originY: MotionValue<number>;
    readonly x: MotionValue<number> | undefined;
    readonly y: MotionValue<number> | undefined;
  },
  options: () => PinchOptions,
  zone: () => { readonly left: number; readonly top: number },
) => {
  const { scale, x, y } = values;
  let from = { scale: 1, x: 0, y: 0 };
  let box = { left: 0, top: 0 };
  // The content point that was under the fingers, in unscaled px.
  let pivot: Point | undefined;
  let fingers: Point = { x: 0, y: 0 };
  let caught = false;

  const local = (point: Point): Point => ({
    x: point.x - box.left,
    y: point.y - box.top,
  });
  const stop = () => {
    scale.stop();
    x?.stop();
    y?.stop();
  };
  /** The scale, with `x`/`y` keeping the pivot under the fingers. */
  const place = (next: number) => {
    scale.set(next);
    if (pivot === undefined) return;
    x?.set(fingers.x - next * pivot.x);
    y?.set(fingers.y - next * pivot.y);
  };
  const landAt = (target: number) => {
    void settle(scale, target);
    if (pivot === undefined) return;
    if (x !== undefined) void settle(x, fingers.x - target * pivot.x);
    if (y !== undefined) void settle(y, fingers.y - target * pivot.y);
  };
  const inside = () => {
    const { min, max } = options();
    const value = scale.get();
    if (clamp(value, min, max) !== value) landAt(clamp(value, min, max));
  };

  return {
    handle: (event: MovementEvent) => {
      const { min, max } = options();
      switch (event.phase) {
        case 'start': {
          caught = false;
          stop();
          box = zone();
          const origin = local(event.origin);
          // First, so it may move the values the Pinch then starts from.
          options().onStart?.({ scale: scale.get(), origin });
          from = { scale: scale.get(), x: x?.get() ?? 0, y: y?.get() ?? 0 };
          values.originX.set(origin.x);
          values.originY.set(origin.y);
          pivot =
            x === undefined || y === undefined
              ? undefined
              : {
                  x: (origin.x - from.x) / from.scale,
                  y: (origin.y - from.y) / from.scale,
                };
          fingers = local(event.point);
          place(bandScale(from.scale * event.scale, min, max));
          return;
        }
        case 'move':
          fingers = local(event.point);
          place(bandScale(from.scale * event.scale, min, max));
          return;
        case 'end':
          fingers = local(event.point);
          place(bandScale(from.scale * event.scale, min, max));
          inside();
          options().onEnd?.({
            scale: clamp(scale.get(), min, max),
            origin: local(event.origin),
          });
          return;
        case 'cancel':
          void settle(scale, from.scale);
          if (x !== undefined) void settle(x, from.x);
          if (y !== undefined) void settle(y, from.y);
      }
    },
    catch: () => {
      if (!scale.isAnimating()) return;
      stop();
      caught = true;
    },
    release: () => {
      if (!caught) return;
      caught = false;
      inside();
    },
  };
};
