import {
  createGestureProvider,
  type GestureListener,
  type GestureProvider,
} from '@kstackz/use-gesture';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  ScrollView,
  type ScrollViewProps,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  type GestureTouchEvent,
} from 'react-native-gesture-handler';
import { makeMutable } from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { exposeDevTouches } from './dev-touches';
import { createFeed } from './feed';
import { nativeScroll, type ScrollPlace } from './native-scroll';
import { dropRunner, feedOn, runnerOn } from './ui-thread';
import { createZones, type Point, type Zone } from './zones';

type ManualGesture = ReturnType<typeof Gesture.Manual>;

type Surface = {
  /** Its provider on the UI thread, by this id (ui-thread.ts). */
  readonly id: number;
  readonly provider: GestureProvider<Zone, Point>;
  readonly zones: ReturnType<typeof createZones>;
  readonly claim: () => void;
  /** `claim` on the UI thread, where it takes effect in the same event. */
  readonly claimOnUI: () => void;
  /** Its manual gesture, which each zone's own runs beside. */
  readonly gesture: ManualGesture;
};

/** A zone inside a surface. */
type Inside = { readonly surface: Surface; readonly zone: Zone };

const SurfaceContext = createContext<Surface | undefined>(undefined);
// The innermost zone around what is being drawn, below the surface's own.
const ZoneContext = createContext<Zone | undefined>(undefined);

const clock = () => performance.now();

// Each surface's id, for its provider on the UI thread.
let surfaces = 0;

// The fingers that changed, as plain data to hand from the UI thread to JS.
const changed = (event: GestureTouchEvent) => {
  'worklet';
  return {
    changedTouches: event.changedTouches.map((touch) => ({
      id: touch.id,
      absoluteX: touch.absoluteX,
      absoluteY: touch.absoluteY,
    })),
  };
};

/**
 * Where native gestures are heard: every finger that touches `children`,
 * tracked by id through one Gesture Handler manual gesture and fed to
 * use-gesture's platform-free core on the JS thread. It is the outermost
 * Gesture Zone; GestureZones inside it nest, and the core gives a touch to
 * the innermost zone that wants it. The same fingers also reach a provider
 * on the UI thread, in the event Gesture Handler reports them, for the
 * listeners of `useWorkletGesture`. Taps, presses and scrolls inside work
 * as before; a listener of `useGesture` takes the touch from them only when
 * it claims it. With `devName`, in development only, scripts can touch it
 * by hand through `globalThis.__touches[devName]`.
 */
export function GestureSurface(props: {
  readonly children: ReactNode;
  readonly devName?: string;
}) {
  const surface = useMemo((): Surface => {
    const id = ++surfaces;
    const zones = createZones();
    const provider = createGestureProvider(zones.tree);
    provider.addZone(zones.root);
    // A landing waits for the next task: by then each zone under the finger
    // has told where it landed, as their gestures hear it in no fixed order.
    const feed = createFeed(provider.sink, clock, (run) => setTimeout(run, 0));
    const forget = () => feed.after(zones.forget);
    // Whether the touch under way is claimed. JS sets it, and the UI thread,
    // where Gesture Handler's state manager lives, activates at the next
    // touch event, which cancels the views and gestures under the fingers;
    // a UI-thread listener sets it in the event itself, which activates at
    // once.
    const claimed = makeMutable(false);
    const claimOnUI = () => {
      'worklet';
      claimed.value = true;
    };
    const gesture = Gesture.Manual()
      .shouldCancelWhenOutside(false)
      .onTouchesDown((event, state) => {
        'worklet';
        if (event.numberOfTouches === event.changedTouches.length) {
          claimed.value = false;
        }
        feedOn(id, 'down', event, performance.now());
        scheduleOnRN(feed.down, changed(event));
        if (claimed.value) state.activate();
      })
      .onTouchesMove((event, state) => {
        'worklet';
        feedOn(id, 'move', event, performance.now());
        scheduleOnRN(feed.move, changed(event));
        if (claimed.value) state.activate();
      })
      .onTouchesUp((event, state) => {
        'worklet';
        feedOn(id, 'up', event, performance.now());
        scheduleOnRN(feed.up, changed(event));
        if (event.numberOfTouches === 0) {
          claimed.value = false;
          scheduleOnRN(forget);
          state.end();
        }
      })
      .onTouchesCancelled((_event, state) => {
        'worklet';
        claimed.value = false;
        runnerOn(id).sink.cancelAll(performance.now());
        scheduleOnRN(feed.cancelled);
        scheduleOnRN(forget);
        state.fail();
      });
    return {
      id,
      provider,
      zones,
      gesture,
      claim: () => {
        claimed.value = true;
      },
      claimOnUI,
    };
  }, []);

  useEffect(() => {
    const { id } = surface;
    return () => {
      scheduleOnUI(() => {
        'worklet';
        dropRunner(id);
      });
    };
  }, [surface]);

  const { devName } = props;
  useEffect(() => {
    if (!__DEV__ || devName === undefined) return;
    const { id } = surface;
    return exposeDevTouches(
      devName,
      surface.provider.sink,
      clock,
      (kind, touch) =>
        scheduleOnUI(() => {
          'worklet';
          if (kind === 'cancel') runnerOn(id).sink.cancelAll(performance.now());
          else feedOn(id, kind, { changedTouches: [touch] }, performance.now());
        }),
    );
  }, [devName, surface]);

  return (
    <SurfaceContext value={surface}>
      <GestureDetector gesture={surface.gesture}>
        <View collapsable={false} className="flex-1">
          {props.children}
        </View>
      </GestureDetector>
    </SurfaceContext>
  );
}

// A zone inside the nearest surface, around what is drawn, heard by
// `listener`; none outside a surface.
function useZone(listener: GestureListener<Point> | undefined) {
  const surface = useContext(SurfaceContext);
  const parent = useContext(ZoneContext) ?? surface?.zones.root;
  const inside = useMemo(
    (): Inside | undefined =>
      surface === undefined || parent === undefined
        ? undefined
        : { surface, zone: surface.zones.inside(parent) },
    [surface, parent],
  );
  useEffect(() => {
    if (inside === undefined) return;
    return inside.surface.provider.addZone(inside.zone);
  }, [inside]);
  useEffect(() => {
    if (inside === undefined || listener === undefined) return;
    return inside.surface.provider.addGesture(inside.zone, listener);
  }, [inside, listener]);
  return inside;
}

/**
 * A zone's own manual gesture, beside the surface's: it tells where fingers
 * land in the zone, which the surface's feed waits for, and never takes a
 * touch.
 */
const zoneGesture = (inside: Inside) => {
  const land = (points: ReadonlyArray<Point>) =>
    inside.surface.zones.land(inside.zone, points);
  return Gesture.Manual()
    .shouldCancelWhenOutside(false)
    .simultaneousWithExternalGesture(inside.surface.gesture)
    .onTouchesDown((event) => {
      'worklet';
      scheduleOnRN(
        land,
        event.changedTouches.map((touch) => ({
          x: touch.absoluteX,
          y: touch.absoluteY,
        })),
      );
    })
    .onTouchesUp((event, state) => {
      'worklet';
      if (event.numberOfTouches === 0) state.end();
    })
    .onTouchesCancelled((_event, state) => {
      'worklet';
      state.fail();
    });
};

/**
 * A Gesture Zone inside a GestureSurface, around `children`: a touch that
 * starts here is heard by `listener` and by the zones around it, and at its
 * first movement the core gives it to the innermost zone whose listener
 * wants it, so a pattern inside keeps its own swipes from one around it,
 * such as a Sidebar's. `style` is the zone's box. Outside a surface it is
 * only that box.
 */
export function GestureZone(props: {
  readonly listener?: GestureListener<Point>;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  const inside = useZone(props.listener);
  const gesture = useMemo(
    () => (inside === undefined ? undefined : zoneGesture(inside)),
    [inside],
  );
  const box = (
    <View collapsable={false} style={props.style}>
      {props.children}
    </View>
  );
  if (inside === undefined || gesture === undefined) return box;
  return (
    <ZoneContext value={inside.zone}>
      <GestureDetector gesture={gesture}>{box}</GestureDetector>
    </ZoneContext>
  );
}

/**
 * A ScrollView in a Gesture Zone of its own, as the web's Native Scroll: a
 * one-finger swipe it can still scroll is its own, and any other, such as a
 * swipe right at its start, goes to the zones around it. It scrolls beside
 * the surface's gesture, so neither cancels the other; it does not bounce
 * unless told, so a swipe that is not its own leaves it still. `style` is
 * the zone's box, around the ScrollView. Outside a surface it is a plain
 * ScrollView in that box.
 */
export function NativeScroll(props: ScrollViewProps) {
  const { style, onScroll, onLayout, onContentSizeChange, ...rest } = props;
  const horizontal = props.horizontal === true;
  const surface = useContext(SurfaceContext);
  const place = useMemo(() => {
    let now: ScrollPlace = { offset: 0, size: 0, content: 0 };
    return {
      now: () => now,
      set: (change: Partial<ScrollPlace>) => {
        now = { ...now, ...change };
      },
    };
  }, []);
  const listener = useMemo(
    () => nativeScroll(horizontal, place.now),
    [horizontal, place],
  );
  const beside = useMemo(
    () =>
      surface === undefined
        ? undefined
        : Gesture.Native().simultaneousWithExternalGesture(surface.gesture),
    [surface],
  );
  const view = (
    <ScrollView
      scrollEventThrottle={16}
      bounces={false}
      {...rest}
      onScroll={(event) => {
        const { x, y } = event.nativeEvent.contentOffset;
        place.set({ offset: horizontal ? x : y });
        onScroll?.(event);
      }}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        place.set({ size: horizontal ? width : height });
        onLayout?.(event);
      }}
      onContentSizeChange={(width, height) => {
        place.set({ content: horizontal ? width : height });
        onContentSizeChange?.(width, height);
      }}
    />
  );
  return (
    <GestureZone listener={listener} style={style}>
      {beside === undefined ? (
        view
      ) : (
        <GestureDetector gesture={beside}>{view}</GestureDetector>
      )}
    </GestureZone>
  );
}

/**
 * Hears every touch of the nearest GestureSurface with `listener`, a
 * use-gesture core listener, in the surface's own zone, the outermost; pass
 * the same one each render. Returns `claim`, which takes the touch under way
 * from Gesture Handler's other gestures and the views inside, so a scroll
 * or a press under the fingers stops.
 */
export function useGesture(listener: GestureListener<unknown>): {
  readonly claim: () => void;
} {
  const surface = useContext(SurfaceContext);
  if (surface === undefined) {
    throw new Error('useGesture must be inside a GestureSurface');
  }
  useEffect(
    () => surface.provider.addGesture(surface.zones.root, listener),
    [surface, listener],
  );
  return { claim: surface.claim };
}

let workletGestures = 0;

/**
 * Hears every touch of the nearest GestureSurface on the UI thread, in the
 * event Gesture Handler reports it, so what it moves shows in the same
 * frame as the finger. `make` is a worklet that makes a use-gesture core
 * listener there, handed `claim`, a worklet that takes the touch under way
 * from Gesture Handler's other gestures and the views inside at once; it is
 * read on mount only, so close over shared values for what changes, and
 * hand anything for the JS thread over with `scheduleOnRN`, never waiting
 * for it. Its provider has only the surface's zone, so its listener watches
 * and claims; it does not take part in which zone takes a touch.
 */
export function useWorkletGesture(
  make: (claim: () => void) => GestureListener<null>,
): void {
  const surface = useContext(SurfaceContext);
  if (surface === undefined) {
    throw new Error('useWorkletGesture must be inside a GestureSurface');
  }
  const first = useRef(make);
  useEffect(() => {
    const key = ++workletGestures;
    const { id, claimOnUI } = surface;
    const made = first.current;
    scheduleOnUI(() => {
      'worklet';
      runnerOn(id).add(key, made(claimOnUI));
    });
    return () => {
      scheduleOnUI(() => {
        'worklet';
        runnerOn(id).remove(key);
      });
    };
  }, [surface]);
}
