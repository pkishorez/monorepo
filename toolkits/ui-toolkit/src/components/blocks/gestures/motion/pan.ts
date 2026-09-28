import type { MotionValue } from 'motion';
import type { MovementEvent, Point } from '../engine';
import { band, clamp, coast, settle } from './springs';

export type Bounds = {
  readonly left?: number;
  readonly right?: number;
  readonly top?: number;
  readonly bottom?: number;
};

export type PanOptions = {
  readonly axis?: 'x' | 'y';
  /** Where the values may rest; read at each gesture, so it may follow a zoom. */
  readonly bounds?: Bounds | (() => Bounds);
  readonly momentum: boolean;
  readonly snap?: number;
  readonly onStart?: (event: PanUpdate) => void;
  readonly onEnd?: (event: PanUpdate) => void;
  readonly onCancel?: () => void;
};

/** What a Pan tells the app as it starts and ends. */
export type PanUpdate = { readonly offset: Point; readonly velocity: Point };

type Axis = 'x' | 'y';

const range = (bounds: Bounds, axis: Axis): readonly [number, number] =>
  axis === 'x'
    ? [bounds.left ?? -Infinity, bounds.right ?? Infinity]
    : [bounds.top ?? -Infinity, bounds.bottom ?? Infinity];

/**
 * Drives a Pan's `x` and `y`: they follow the fingers from where they were,
 * rubber-banded past the bounds, and on release coast on with the fingers'
 * speed (or spring back inside the bounds, without momentum). A touch
 * landing mid-coast catches them. `size` is the zone's, for the rubber band.
 */
export const createPan = (
  values: { readonly x: MotionValue<number>; readonly y: MotionValue<number> },
  options: () => PanOptions,
  size: () => { readonly width: number; readonly height: number },
) => {
  let origin: Point = { x: 0, y: 0 };
  let dimensions = { width: 0, height: 0 };
  let caught = false;

  const axes = (): ReadonlyArray<Axis> => {
    const { axis } = options();
    return axis === undefined ? ['x', 'y'] : [axis];
  };
  const bounds = (): Bounds => {
    const given = options().bounds;
    return typeof given === 'function' ? given() : (given ?? {});
  };
  const stop = () => {
    values.x.stop();
    values.y.stop();
  };

  const place = (offset: Point) => {
    const limits = bounds();
    for (const axis of axes()) {
      const [min, max] = range(limits, axis);
      const dimension = axis === 'x' ? dimensions.width : dimensions.height;
      values[axis].set(band(origin[axis] + offset[axis], min, max, dimension));
    }
  };

  /** Back inside the bounds, for any axis that is outside them. */
  const inside = () => {
    const limits = bounds();
    for (const axis of axes()) {
      const [min, max] = range(limits, axis);
      const value = values[axis].get();
      if (clamp(value, min, max) !== value) {
        void settle(values[axis], clamp(value, min, max));
      }
    }
  };

  const letGo = (velocity: Point) => {
    const { momentum, snap } = options();
    if (!momentum) {
      inside();
      return;
    }
    const limits = bounds();
    for (const axis of axes()) {
      const [min, max] = range(limits, axis);
      void coast(values[axis], {
        velocity: velocity[axis],
        min: Number.isFinite(min) ? min : undefined,
        max: Number.isFinite(max) ? max : undefined,
        snap,
      });
    }
  };

  return {
    handle: (event: MovementEvent) => {
      const update = { offset: event.offset, velocity: event.velocity };
      switch (event.phase) {
        case 'start':
          caught = false;
          stop();
          // First, so it may move the values the Pan then starts from.
          options().onStart?.(update);
          origin = { x: values.x.get(), y: values.y.get() };
          dimensions = size();
          place(event.offset);
          return;
        case 'move':
          place(event.offset);
          return;
        case 'end':
          place(event.offset);
          letGo(event.velocity);
          options().onEnd?.(update);
          return;
        case 'cancel':
          void settle(values.x, origin.x);
          void settle(values.y, origin.y);
          options().onCancel?.();
      }
    },
    catch: () => {
      if (!values.x.isAnimating() && !values.y.isAnimating()) return;
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
