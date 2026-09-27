import { type MotionValue, useMotionValue } from 'motion/react';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { Direction, Hold, Point } from '../engine';
import {
  type Bounds,
  createPan,
  createPinch,
  createSwipe,
  type GestureSpring,
  type PanUpdate,
  type PinchUpdate,
} from '../motion';
import { useZone, zoneBox } from '../provider';
import { warnFallbackOff } from '../registry';
import { type Common, useLatest, useRegistration } from './register';

const on = (options: { readonly enabled?: boolean }) => () =>
  options.enabled !== false;

/** Calls `onTap` for a tap of `fingers` with `hold`, as the fingers lift. */
export function useTap(
  options: Common & {
    readonly onTap: (event: {
      readonly point: Point;
      readonly hold: Hold | undefined;
    }) => void;
  },
): void {
  const hub = useZone('useTap');
  const latest = useLatest(options);
  const { fingers = 1, hold = 'none' } = options;
  useRegistration(hub, ['tap', fingers, hold], () => ({
    gesture: 'tap',
    fingers,
    hold,
    enabled: () => on(latest.current)(),
    handle: (event) =>
      latest.current.onTap({ point: event.point, hold: event.hold }),
  }));
}

/**
 * Moves `x` and `y` with the fingers: set on every move, so a
 * `<motion.div style={{ x, y }}>` follows with no React render. Past
 * `bounds` they rubber-band and spring back; on release they coast on with
 * the fingers' speed (`momentum`, on by default), resting on a multiple of
 * `snap` if given. A touch landing mid-coast catches them. Pass your own
 * values to share them, or read the ones it makes; they carry over from one
 * gesture to the next. `bounds` may be a function, read as each gesture
 * starts, to follow a zoom.
 */
export function usePan(
  options: Common & {
    readonly x?: MotionValue<number>;
    readonly y?: MotionValue<number>;
    readonly axis?: 'x' | 'y';
    readonly bounds?: Bounds | (() => Bounds);
    readonly momentum?: boolean;
    readonly snap?: number;
    readonly onStart?: (event: PanUpdate) => void;
    readonly onEnd?: (event: PanUpdate) => void;
  } = {},
): { readonly x: MotionValue<number>; readonly y: MotionValue<number> } {
  const hub = useZone('usePan');
  const ownX = useMotionValue(0);
  const ownY = useMotionValue(0);
  const x = options.x ?? ownX;
  const y = options.y ?? ownY;
  const latest = useLatest(options);
  const [driver] = useState(() =>
    createPan(
      { x, y },
      () => ({
        ...latest.current,
        momentum: latest.current.momentum !== false,
      }),
      () => zoneBox(hub),
    ),
  );
  const { fingers = 1, hold = 'none', axis } = options;
  useRegistration(hub, ['pan', fingers, hold, axis ?? 'both'], () => ({
    gesture: 'pan',
    fingers,
    hold,
    axis,
    enabled: () => on(latest.current)(),
    handle: driver.handle,
    catch: driver.catch,
    release: driver.release,
  }));
  return { x, y };
}

/**
 * Follows a Swipe in `direction` as `progress`: 0 at rest, 1 after `distance`
 * px, set on every move however slowly, clamped at 0 and rubber-banded past
 * 1. `armed` is 1 while releasing now would commit (at 40% or past, or on a
 * forward flick), for a "Release to refresh". On release it springs to 1 and
 * runs `onSwipe`, or back to 0 and runs `onCancel`, carrying the finger's
 * speed. After a commit, `return` springs home once `onSwipe`'s promise
 * settles; `stay` stays at 1 until a Swipe the opposite way drags it back.
 * `settle: false` leaves the animation after release to you. `open()`
 * commits as if swiped; `close()` springs it to 0.
 *
 * `edge: true` starts only at the edge opposite `direction` (right from the
 * left edge), where the app owns that edge (`source: 'edge'`). Where the
 * browser or OS owns it, the Swipe starts from anywhere in the zone instead
 * (`source: 'zone'`), unless another hook in the zone chain already takes
 * it: then `available` is false.
 */
export function useSwipe(
  options: Common & {
    readonly direction: Direction;
    readonly distance: number;
    readonly edge?: boolean;
    readonly after?: 'return' | 'stay';
    readonly settle?: boolean;
    /** Overrides the shared settle spring, useful for product-specific tuning. */
    readonly spring?: GestureSpring;
    readonly progress?: MotionValue<number>;
    readonly onSwipe?: () => void | Promise<void>;
    readonly onCancel?: () => void;
  },
): {
  readonly progress: MotionValue<number>;
  readonly armed: MotionValue<number>;
  readonly source: 'edge' | 'zone';
  readonly available: boolean;
  readonly open: () => void;
  readonly close: () => void;
} {
  const hub = useZone('useSwipe');
  const ownProgress = useMotionValue(0);
  const armed = useMotionValue(0);
  const progress = options.progress ?? ownProgress;
  const latest = useLatest(options);
  const [driver] = useState(() =>
    createSwipe({ progress, armed }, () => ({
      ...latest.current,
      after: latest.current.after ?? 'return',
      settle: latest.current.settle !== false,
    })),
  );
  const { direction, fingers = 1, hold = 'none', edge = false } = options;
  const registration = useRegistration(
    hub,
    ['swipe', direction, fingers, hold, edge],
    () => ({
      gesture: 'swipe',
      direction,
      fingers,
      hold,
      edge,
      enabled: () => on(latest.current)(),
      directions: driver.directions,
      opened: driver.opened,
      handle: driver.handle,
      catch: driver.catch,
      release: driver.release,
    }),
  );
  const state = useSyncExternalStore(
    hub.registry.subscribe,
    () => {
      const added = registration.current;
      return added === undefined ? 'zone' : hub.registry.edgeState(added);
    },
    () => 'zone' as const,
  );
  useEffect(() => {
    if (state === 'off') warnFallbackOff(direction);
  }, [state, direction]);
  return {
    progress,
    armed,
    source: state === 'edge' ? 'edge' : 'zone',
    available: state !== 'off',
    open: driver.open,
    close: driver.close,
  };
}

/**
 * Scales with two fingers: `scale` is the start scale times their distance
 * over the one they went down at, rubber-banded past `min` and `max`
 * (1 and 4 by default) and springing back inside on release.
 * `originX`/`originY` are where they went down, in px from the zone's top
 * left. Pass a Pan's `x` and `y` to zoom around the fingers: they move so
 * the point under the fingers stays there, for an element at the zone's top
 * left transformed from its own top left (`originX: 0, originY: 0`).
 */
export function usePinch(
  options: Omit<Common, 'fingers'> & {
    readonly scale?: MotionValue<number>;
    readonly min?: number;
    readonly max?: number;
    readonly x?: MotionValue<number>;
    readonly y?: MotionValue<number>;
    readonly onStart?: (event: PinchUpdate) => void;
    readonly onEnd?: (event: PinchUpdate) => void;
  } = {},
): {
  readonly scale: MotionValue<number>;
  readonly originX: MotionValue<number>;
  readonly originY: MotionValue<number>;
} {
  const hub = useZone('usePinch');
  const ownScale = useMotionValue(1);
  const originX = useMotionValue(0);
  const originY = useMotionValue(0);
  const scale = options.scale ?? ownScale;
  const latest = useLatest(options);
  const [driver] = useState(() =>
    createPinch(
      { scale, originX, originY, x: options.x, y: options.y },
      () => ({
        ...latest.current,
        min: latest.current.min ?? 1,
        max: latest.current.max ?? 4,
      }),
      () => zoneBox(hub),
    ),
  );
  const { hold = 'none' } = options;
  useRegistration(hub, ['pinch', hold], () => ({
    gesture: 'pinch',
    fingers: 2,
    hold,
    enabled: () => on(latest.current)(),
    handle: driver.handle,
    catch: driver.catch,
    release: driver.release,
  }));
  return { scale, originX, originY };
}

/**
 * The Hold locked in the nearest zone or a zone inside it: which side of the
 * acting fingers, and where. Re-renders only as it locks and releases.
 */
export function useHold(): Hold | undefined {
  const hub = useZone('useHold');
  return useSyncExternalStore(
    hub.hold.subscribe,
    hub.hold.get,
    useCallback(() => undefined, []),
  );
}
