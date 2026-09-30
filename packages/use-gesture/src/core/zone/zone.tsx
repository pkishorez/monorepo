import { type MotionValue, useMotionValue } from 'motion/react';
import {
  type ComponentProps,
  type CSSProperties,
  createContext,
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  createTouchInput,
  type Direction,
  type Directions,
} from '../touch-input/index.ts';
import {
  createTracker,
  type GestureEnd,
  type Pointer,
  type Pointers,
  type Tracker,
} from './tracker/index.ts';

export type { GestureEnd, Pointer, Pointers } from './tracker/index.ts';
export type { Direction, Directions } from '../touch-input/index.ts';

type Provided = {
  readonly tracker: Tracker;
  readonly bindZone: (element: Element) => () => void;
};

const ProviderContext = createContext<Provided | undefined>(undefined);

type Zone = { readonly tracker: Tracker; readonly element: Element | null };

const ZoneContext = createContext<Zone | undefined>(undefined);

const assignRef = <T,>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === 'function') ref(value);
  else if (ref !== null && ref !== undefined) ref.current = value;
};

/**
 * Tracks every Gesture in the Gesture Zones inside it: the one place its
 * fingers are followed. Put one at the app's root; separate sections may
 * each have their own, and each then runs its own Gesture. One inside
 * another does nothing: its zones join the outer one, so nested screens
 * share one Gesture.
 */
export function GestureProvider(props: { readonly children?: ReactNode }) {
  const outer = useContext(ProviderContext);
  return outer === undefined ? (
    <Provider>{props.children}</Provider>
  ) : (
    props.children
  );
}

function Provider(props: { readonly children?: ReactNode }) {
  const [provided] = useState(() => {
    const tracker = createTracker();
    const input =
      typeof window === 'undefined'
        ? undefined
        : createTouchInput(window, tracker.sink);
    return {
      tracker,
      input,
      bindZone: (element: Element) => input?.bindZone(element) ?? (() => {}),
    };
  });

  useEffect(() => {
    provided.input?.start();
    return () => provided.input?.stop();
  }, [provided]);

  return <ProviderContext value={provided}>{props.children}</ProviderContext>;
}

export type GestureZoneProps = ComponentProps<'div'> & {
  /**
   * Whether Gestures that start in it stay in it, rather than also reaching
   * the zones around it. It never keeps a touch from the browser. False by
   * default. Read as a Gesture starts.
   */
  readonly trapped?: boolean;
};

// Touch defaults for the zone's own element, as inline style so they need no
// stylesheet; `style` on the zone overrides any of them.
const ZONE_STYLE: CSSProperties = {
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
};

/**
 * An area where the app can own touch, read with `useGesture` by any
 * component inside it, shown or hidden. A Gesture starting in it is heard
 * here and by each zone around it up to the first trapped one; sibling
 * zones never hear each other. At the first movement one of them takes it,
 * if a listener wants it; otherwise the browser scrolls. Zones nest, and
 * must be inside a GestureProvider.
 */
export function GestureZone({
  ref,
  style,
  children,
  trapped = false,
  ...props
}: GestureZoneProps) {
  const provided = useContext(ProviderContext);
  if (provided === undefined) {
    throw new Error('GestureZone must be used inside a GestureProvider');
  }
  const { tracker, bindZone } = provided;
  const [element, setElement] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (element === null) return;
    const removeZone = tracker.addZone(element);
    const unbind = bindZone(element);
    return () => {
      unbind();
      removeZone();
    };
  }, [tracker, bindZone, element]);

  const attach = useCallback(
    (next: HTMLDivElement | null) => {
      setElement(next);
      assignRef(ref, next);
    },
    [ref],
  );

  return (
    <ZoneContext value={{ tracker, element }}>
      <div
        ref={attach}
        data-slot="gesture-zone"
        data-trapped={trapped ? '' : undefined}
        style={{ ...ZONE_STYLE, ...style }}
        {...props}
      >
        {children}
      </div>
    </ZoneContext>
  );
}

// The nearest Gesture Zone; hooks throw a clear error outside one.
const useZone = (user: string): Zone => {
  const zone = useContext(ZoneContext);
  if (zone === undefined) {
    throw new Error(`${user} must be used inside a GestureZone`);
  }
  return zone;
};

// The latest options, read by the zone mid-Gesture without re-registering.
const useLatest = <T,>(value: T) => {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
};

const NONE: Pointers = new Map();

export type GestureOptions = {
  /** Whether it takes the next Gesture: true by default. Read as its first finger lands. */
  readonly enabled?: boolean;
  /** The first finger landed. */
  readonly onStart?: (pointers: Pointers) => void;
  /** A finger landed or lifted; `pointer` is that finger. */
  readonly onPointer?: (pointer: Pointer, pointers: Pointers) => void;
  /**
   * The last finger lifted: every finger of the Gesture, lifted ones
   * included. Also when the browser or another zone took it, `interrupted`.
   */
  readonly onEnd?: (pointers: Pointers, end: GestureEnd) => void;
  /**
   * The Directions it takes touches in: `['left', 'right']`, or `'all'`. An
   * element under the finger that can still scroll that way keeps it
   * instead. Read at the touch's first movement. Without `directions` or
   * `captures` it only watches, and never keeps a touch from the browser.
   */
  readonly directions?: Directions;
  /** The Gesture first moved in `direction`: read once, for every listener. */
  readonly onDirection?: (direction: Direction) => void;
  /**
   * Whether it captures a touch whose first finger landed at `point`, in
   * viewport px, whichever way it moves, even over an element that could
   * scroll it. Read at the touch's first movement; taps are never affected.
   */
  readonly captures?: (point: {
    readonly x: number;
    readonly y: number;
  }) => boolean;
};

export type GestureState = {
  /**
   * Every finger of the Gesture under way, by id, lifted ones included;
   * empty between Gestures. It changes as a finger lands or lifts; each
   * finger's own motion values follow it as it moves.
   */
  readonly pointers: MotionValue<Pointers>;
  /** True from the first finger landing until the last one lifts. */
  readonly active: boolean;
};

/**
 * Reads every Gesture its nearest Gesture Zone hears: each that starts in
 * it, or in a zone inside it that is not trapped, until another zone takes
 * it, unless it only watches. It reports each finger
 * that lands between the first landing and the last lifting, with where,
 * when and on what it landed and motion values that follow it. It never
 * classifies anything; what a Gesture means is up to the caller.
 */
export function useGesture(options: GestureOptions = {}): GestureState {
  const { tracker, element } = useZone('useGesture');
  const latest = useLatest(options);
  const pointers = useMotionValue(NONE);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (element === null) return;
    return tracker.addGesture(element, {
      enabled: () => latest.current.enabled !== false,
      start: (next) => {
        pointers.set(next);
        setActive(true);
        latest.current.onStart?.(next);
      },
      pointer: (pointer, next) => {
        pointers.set(next);
        latest.current.onPointer?.(pointer, next);
      },
      captures: (point) => latest.current.captures?.(point) === true,
      directions: () => latest.current.directions,
      acts: () =>
        latest.current.captures !== undefined ||
        latest.current.directions !== undefined,
      direction: (direction) => latest.current.onDirection?.(direction),
      end: (last, end) => {
        latest.current.onEnd?.(last, end);
        pointers.set(NONE);
        setActive(false);
      },
    });
  }, [tracker, element, latest, pointers]);

  return { pointers, active };
}
