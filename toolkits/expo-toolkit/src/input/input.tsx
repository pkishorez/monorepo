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
} from 'react';
import { View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  type GestureTouchEvent,
} from 'react-native-gesture-handler';
import { makeMutable } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { exposeDevTouches } from './dev-touches';
import { createFeed } from './feed';

// A surface is one zone of its own provider: every finger lands on it.
type Zone = { readonly surface: true };
type Surface = {
  readonly provider: GestureProvider<Zone, unknown>;
  readonly zone: Zone;
  readonly claim: () => void;
};

const SurfaceContext = createContext<Surface | undefined>(undefined);

const clock = () => performance.now();

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
 * use-gesture's platform-free core on the JS thread. Taps, presses and
 * scrolls inside work as before; a listener of `useGesture` takes the touch
 * from them only when it claims it. With `devName`, in development only,
 * scripts can touch it by hand through `globalThis.__touches[devName]`.
 */
export function GestureSurface(props: {
  readonly children: ReactNode;
  readonly devName?: string;
}) {
  const { surface, gesture } = useMemo(() => {
    const zone: Zone = { surface: true };
    const provider = createGestureProvider<Zone, unknown>({
      zoneOf: () => zone,
      parentOf: () => null,
      trapped: () => false,
    });
    provider.addZone(zone);
    const feed = createFeed(provider.sink, zone, clock);
    // Whether the touch under way is claimed. JS sets it; the UI thread,
    // where Gesture Handler's state manager lives, activates at the next
    // touch event, which cancels the views and gestures under the fingers.
    const claimed = makeMutable(false);
    const gesture = Gesture.Manual()
      .shouldCancelWhenOutside(false)
      .onTouchesDown((event, state) => {
        'worklet';
        if (event.numberOfTouches === event.changedTouches.length) {
          claimed.value = false;
        }
        scheduleOnRN(feed.down, changed(event));
        if (claimed.value) state.activate();
      })
      .onTouchesMove((event, state) => {
        'worklet';
        scheduleOnRN(feed.move, changed(event));
        if (claimed.value) state.activate();
      })
      .onTouchesUp((event, state) => {
        'worklet';
        scheduleOnRN(feed.up, changed(event));
        if (event.numberOfTouches === 0) {
          claimed.value = false;
          state.end();
        }
      })
      .onTouchesCancelled((_event, state) => {
        'worklet';
        claimed.value = false;
        scheduleOnRN(feed.cancelled);
        state.fail();
      });
    const surface: Surface = {
      provider,
      zone,
      claim: () => {
        claimed.value = true;
      },
    };
    return { surface, gesture };
  }, []);

  const { devName } = props;
  useEffect(() => {
    if (!__DEV__ || devName === undefined) return;
    return exposeDevTouches(
      devName,
      surface.provider.sink,
      surface.zone,
      clock,
    );
  }, [devName, surface]);

  return (
    <SurfaceContext value={surface}>
      <GestureDetector gesture={gesture}>
        <View collapsable={false} className="flex-1">
          {props.children}
        </View>
      </GestureDetector>
    </SurfaceContext>
  );
}

/**
 * Hears every touch of the nearest GestureSurface with `listener`, a
 * use-gesture core listener; pass the same one each render. Returns `claim`,
 * which takes the touch under way from Gesture Handler's other gestures and
 * the views inside, so a scroll or a press under the fingers stops.
 */
export function useGesture(listener: GestureListener<unknown>): {
  readonly claim: () => void;
} {
  const surface = useContext(SurfaceContext);
  if (surface === undefined) {
    throw new Error('useGesture must be inside a GestureSurface');
  }
  useEffect(
    () => surface.provider.addGesture(surface.zone, listener),
    [surface, listener],
  );
  return { claim: surface.claim };
}
