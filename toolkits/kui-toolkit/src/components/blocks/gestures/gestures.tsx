import { animate } from 'motion';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '#lib/utils';
import { DebugOverlay } from './debug-overlay';
import { createGestureEngine, type GestureEngine } from './engine';
import {
  createEnvironmentStore,
  serverEnvironment,
  type Environment,
} from './environment';
import {
  GESTURE_KINDS,
  recognizersFor,
  type GestureEvent,
  type GestureKind,
} from './recognizers';
import { FingerLayer } from './fingers';
import type { ZoneSource } from './layer';
import {
  bindZone,
  measureZone,
  nativeScrollers,
  swallowNextClick,
} from './zone';

export type { Environment, GestureEvent };
export { ANDROID_EDGE_STRIP_PX, EDGE_STRIP_PX } from './zone';

let environmentStore: ReturnType<typeof createEnvironmentStore> | undefined;
const store = () => (environmentStore ??= createEnvironmentStore(window));

const useEnvironment = (): Environment =>
  useSyncExternalStore(
    (listener) => store().subscribe(listener),
    () => store().get(),
    () => serverEnvironment,
  );

/** What a zone shares with the layers inside it; mutated in effects only. */
type Hub = {
  element: HTMLElement | null;
  engine: GestureEngine | undefined;
  environment: Environment;
  readonly listeners: Set<() => void>;
};

const ZoneContext = createContext<Hub | undefined>(undefined);

const notify = (hub: Hub) => {
  for (const listener of hub.listeners) listener();
};

// Lifting a finger after one of these must not also click what is under it.
const CLAIMS_CLICK: ReadonlySet<GestureKind> = new Set(['pan', 'chord']);

const assignRef = <T,>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === 'function') ref(value);
  else if (ref !== null && ref !== undefined) ref.current = value;
};

/**
 * A region where the app owns touch input: the element minus the edge
 * strips the browser or OS swipes from. Vertical scrolling stays native
 * (`touch-action: pan-y`) until a recognizer claims the touch; then it is
 * Captured and the page holds still until every finger lifts. Touches that
 * start in a native sideways scroller inside are left to it. Everything else
 * is recognized and handed to `onGesture`, one call per phase. Long-press
 * callouts and text selection are off inside, so holds work. `recognizers`
 * picks the gestures, all of them by default. Frames never re-render React:
 * `onGesture` should write styles directly for anything that follows a
 * finger.
 */
export function GestureZone({
  recognizers = GESTURE_KINDS,
  onGesture,
  className,
  ref,
  ...props
}: ComponentProps<'div'> & {
  readonly recognizers?: ReadonlyArray<GestureKind>;
  readonly onGesture?: (event: GestureEvent) => void;
}) {
  const environment = useEnvironment();
  const [hub] = useState<Hub>(() => ({
    element: null,
    engine: undefined,
    environment,
    listeners: new Set(),
  }));
  const handler = useRef(onGesture);
  const kinds = recognizers.join(' ');

  useEffect(() => {
    hub.environment = environment;
    handler.current = onGesture;
  });

  useEffect(() => {
    const element = hub.element;
    if (element === null) return;
    const win = element.ownerDocument.defaultView ?? window;
    const engine = createGestureEngine({
      recognizers: recognizersFor(kinds.split(' ') as Array<GestureKind>),
      width: () => {
        const { rect } = measureZone(element, hub.environment);
        return rect.right - rect.left;
      },
      onGesture: (event) => {
        if (event.phase === 'ended' && CLAIMS_CLICK.has(event.kind)) {
          swallowNextClick(win);
        }
        handler.current?.(event);
      },
    });
    const stopNotifying = engine.subscribe(() => notify(hub));
    hub.engine = engine;
    const unbind = bindZone(element, engine, () => hub.environment);
    notify(hub);
    return () => {
      unbind();
      stopNotifying();
      hub.engine = undefined;
    };
  }, [hub, kinds]);

  const setElement = useCallback(
    (node: HTMLDivElement | null) => {
      hub.element = node;
      assignRef(ref, node);
    },
    [hub, ref],
  );

  return (
    <ZoneContext value={hub}>
      <div
        ref={setElement}
        data-slot="gesture-zone"
        className={cn(
          'touch-pan-y overscroll-x-none select-none [-webkit-touch-callout:none]',
          className,
        )}
        {...props}
      />
    </ZoneContext>
  );
}

const subscribeNothing = () => () => {};

/**
 * What the layers inside a zone read from it, or nothing until it is on
 * the client: layers are portalled to the body.
 */
const useZoneSource = (component: string): ZoneSource | undefined => {
  const hub = useContext(ZoneContext);
  if (hub === undefined) {
    throw new Error(`${component} must be rendered inside a GestureZone`);
  }
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const source = useMemo<ZoneSource>(
    () => ({
      subscribe: (listener) => {
        hub.listeners.add(listener);
        return () => hub.listeners.delete(listener);
      },
      inspect: () => hub.engine?.inspect(),
      measure: () =>
        hub.element === null
          ? undefined
          : measureZone(hub.element, hub.environment),
      scrollers: () =>
        hub.element === null ? [] : nativeScrollers(hub.element),
      environment: () => hub.environment,
    }),
    [hub],
  );
  return mounted ? source : undefined;
};

/**
 * Shows every finger in the enclosing Gesture Zone by what it is doing: a
 * soft ring while undecided or free, the Anchor of a Chord locked with the
 * zone dimmed around it, and a comet tail behind the acting finger. Paints
 * only while fingers are down or fading, and takes no input. Render it
 * anywhere inside a `GestureZone`; it works with or without the debug
 * overlay.
 */
export function GestureFingers() {
  const source = useZoneSource('GestureFingers');
  if (source === undefined) return null;
  return createPortal(<FingerLayer source={source} />, document.body);
}

/**
 * Shows what the enclosing Gesture Zone sees: the zone and its edge strips
 * labelled with who owns them, native scrollers inside it, every finger's
 * pointer id, and the Environment in one line. It never takes input and
 * paints only while something changes. Render it anywhere inside a
 * `GestureZone`.
 */
export function GestureDebugOverlay() {
  const source = useZoneSource('GestureDebugOverlay');
  const environment = useEnvironment();
  if (source === undefined) return null;
  return createPortal(
    <DebugOverlay source={source} environment={environment} />,
    document.body,
  );
}

/** Share of the full travel past which a slow release commits. */
export const COMMIT_PROGRESS = 0.4;
/** Release speed toward (or away from) commit, in px/ms, that decides on its own. */
export const FLICK_VELOCITY = 0.3;

/**
 * Whether a released swipe commits (pages the carousel, opens the drawer): a
 * flick decides by its direction; a slow release commits past 40% of the
 * travel. `progress` and `velocity` are measured toward commit.
 */
export const shouldCommit = (release: {
  readonly progress: number;
  readonly velocity: number;
}): boolean => {
  if (release.velocity >= FLICK_VELOCITY) return true;
  if (release.velocity <= -FLICK_VELOCITY) return false;
  return release.progress > COMMIT_PROGRESS;
};

// UIScrollView's constant: resistance that grows with distance.
const RUBBER_BAND = 0.55;

/**
 * How far a surface moves when the finger has gone `overshoot` px past its
 * bound: less and less, never as far as `dimension`.
 */
export const rubberBand = (overshoot: number, dimension: number): number =>
  dimension <= 0
    ? 0
    : (1 - 1 / ((overshoot * RUBBER_BAND) / dimension + 1)) * dimension;

// No bounce: the surface lands, carrying the finger's speed into the landing.
const SETTLE_SPRING = {
  type: 'spring',
  visualDuration: 0.35,
  bounce: 0,
} as const;

/**
 * Carries a released surface to rest: springs from `from` to `to` starting
 * at the release velocity (units per ms), calling `onUpdate` every frame.
 * `instant` jumps straight there, for reduced motion. `stop` freezes it
 * where it is, so the next gesture can pick it up.
 */
export const settle = (options: {
  readonly from: number;
  readonly to: number;
  readonly velocity: number;
  readonly instant: boolean;
  readonly onUpdate: (value: number) => void;
}): { readonly finished: Promise<void>; readonly stop: () => void } => {
  if (options.instant || options.from === options.to) {
    options.onUpdate(options.to);
    return { finished: Promise.resolve(), stop: () => {} };
  }
  const controls = animate(options.from, options.to, {
    ...SETTLE_SPRING,
    velocity: options.velocity * 1000,
    onUpdate: options.onUpdate,
  });
  return {
    finished: controls.finished.then(() => undefined),
    stop: () => controls.stop(),
  };
};

// motion's inertia defaults, which feel like a UIScrollView flick: the
// surface runs on 0.8 × the release speed (per second) and slows over ~1s.
const COAST_POWER = 0.8;
const COAST_TIME_CONSTANT = 325;

/**
 * Lets a released surface run on with the finger's speed (units per ms)
 * and slow to a stop by friction, calling `onUpdate` every frame. Past `min`
 * or `max` it bounces back to the bound. `snap` is a step it must come to
 * rest on, for detents. `instant` jumps straight to where it would rest, for
 * reduced motion. `stop` freezes it where it is, as with {@link settle}.
 * Rest is judged to half a unit, so coast pixels, not fractions.
 */
export const coast = (options: {
  readonly from: number;
  readonly velocity: number;
  readonly min?: number;
  readonly max?: number;
  readonly snap?: number;
  readonly instant: boolean;
  readonly onUpdate: (value: number) => void;
}): { readonly finished: Promise<void>; readonly stop: () => void } => {
  const { from, min, max, snap } = options;
  const clamp = (value: number) =>
    Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));
  const detent =
    snap === undefined
      ? undefined
      : (value: number) => Math.round(value / snap) * snap;
  const ideal = from + COAST_POWER * options.velocity * 1000;
  // Where it comes to rest. Released past a bound, it goes straight back.
  const rest =
    clamp(from) !== from ? clamp(from) : clamp(detent?.(ideal) ?? ideal);
  if (options.instant) {
    options.onUpdate(rest);
    return { finished: Promise.resolve(), stop: () => {} };
  }
  // Inertia reads only the start and plots its own way; the end is given
  // because motion skips an animation whose keyframes do not change.
  const controls = animate(from, rest, {
    type: 'inertia',
    velocity: options.velocity * 1000,
    power: COAST_POWER,
    timeConstant: COAST_TIME_CONSTANT,
    min,
    max,
    modifyTarget: detent,
    onUpdate: options.onUpdate,
  });
  return {
    finished: controls.finished.then(() => undefined),
    stop: () => controls.stop(),
  };
};
