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
import { DebugOverlay, type OverlaySource } from './debug-overlay';
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
import { bindZone, measureZone, swallowNextClick } from './zone';

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

/** What a zone shares with the overlay inside it; mutated in effects only. */
type Hub = {
  element: HTMLElement | null;
  engine: GestureEngine | undefined;
  environment: Environment;
  readonly listeners: Set<(event: GestureEvent | undefined) => void>;
};

const ZoneContext = createContext<Hub | undefined>(undefined);

const notify = (hub: Hub, event: GestureEvent | undefined) => {
  for (const listener of hub.listeners) listener(event);
};

// Lifting a finger after one of these must not also click what is under it.
const CLAIMS_CLICK: ReadonlySet<GestureKind> = new Set([
  'pan',
  'two-finger-pan',
  'pinch',
  'hold-swipe',
  'long-press',
]);

const assignRef = <T,>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === 'function') ref(value);
  else if (ref !== null && ref !== undefined) ref.current = value;
};

/**
 * A region where the app owns touch input: the element minus the edge
 * strips the browser or OS swipes from. Vertical one-finger scrolling stays
 * native (`touch-action: pan-y`); everything else inside is recognized and
 * handed to `onGesture`, one call per phase. Long-press callouts and text
 * selection are off inside, so holds work. `recognizers` picks the gestures,
 * all of them by default. Frames never re-render React: `onGesture` should
 * write styles directly for anything that follows a finger.
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
        notify(hub, event);
      },
    });
    const stopNotifying = engine.subscribe(() => notify(hub, undefined));
    hub.engine = engine;
    const unbind = bindZone(element, engine, () => hub.environment);
    notify(hub, undefined);
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
 * Shows what the enclosing Gesture Zone sees: the zone and its edge strips
 * labelled with who owns them, every pointer with a fading trail, each
 * recognizer's state and which one claimed, a log of recognized gestures,
 * and the Environment. It never takes input and paints only while something
 * changes. Render it anywhere inside a `GestureZone`.
 */
export function GestureDebugOverlay() {
  const hub = useContext(ZoneContext);
  if (hub === undefined) {
    throw new Error(
      'GestureDebugOverlay must be rendered inside a GestureZone',
    );
  }
  const environment = useEnvironment();
  // Portalled to the body, so render only once there is one.
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const source = useMemo<OverlaySource>(
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
    }),
    [hub],
  );
  if (!mounted) return null;
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
