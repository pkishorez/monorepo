import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BackHandler, useWindowDimensions } from 'react-native';
import { useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { useGesture, useWorkletGesture } from '../../input';
import { along, type Progress, settle, widthOn } from './motion';
import { sidebarSwipe } from './swipe';
import { type Panel, Push } from './push';

type SidebarState = {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly toggle: () => void;
};

// What the Sidebar's own parts share: the open amount a finger drives, and
// where the Sidebar hands in what it shows.
type Motion = {
  readonly progress: Progress;
  readonly width: number;
  readonly still: boolean;
  readonly settle: (open: boolean, velocity: number) => void;
  readonly show: (panel: Panel | undefined) => void;
};

const SidebarContext = createContext<SidebarState | undefined>(undefined);
const MotionContext = createContext<Motion | undefined>(undefined);

/**
 * The app with a Sidebar beside it, as on a phone on the web: `children` is
 * the page, which moves aside, shrinks, rounds and dims as the Sidebar under
 * it opens, springing from wherever a finger left it. Holds whether it is
 * open, for the Sidebar and anything that opens or shuts it: a menu button,
 * a Command, a swipe. Open, Android's back button shuts it.
 */
export function SidebarProvider(props: { readonly children: ReactNode }) {
  const [open, setOpenNow] = useState(false);
  const [panel, show] = useState<Panel>();
  const progress = useSharedValue(0);
  const still = useReducedMotion();
  const width = widthOn(useWindowDimensions().width);

  const move = useCallback(
    (next: boolean, velocity: number) => {
      settle(progress, next ? 1 : 0, velocity, still);
      setOpenNow(next);
    },
    [progress, still],
  );
  const shut = useCallback(() => setOpenNow(false), []);

  const state = useMemo(
    () => ({
      open,
      setOpen: (next: boolean) => move(next, 0),
      toggle: () => move(!open, 0),
    }),
    [open, move],
  );
  const motion = useMemo(
    () => ({ progress, width, still, settle: move, show }),
    [progress, width, still, move],
  );

  useEffect(() => {
    if (!open) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      move(false, 0);
      return true;
    });
    return () => back.remove();
  }, [open, move]);

  return (
    <SidebarContext value={state}>
      <MotionContext value={motion}>
        <Push
          progress={progress}
          width={width}
          open={open}
          still={still}
          onShut={shut}
          panel={panel}
        >
          {props.children}
        </Push>
      </MotionContext>
    </SidebarContext>
  );
}

/** Whether the Sidebar is open, and the ways to open and shut it. */
export function useSidebar(): SidebarState {
  const state = useContext(SidebarContext);
  if (state === undefined)
    throw new Error('useSidebar must be inside SidebarProvider');
  return state;
}

function useMotion(): Motion {
  const motion = useContext(MotionContext);
  if (motion === undefined)
    throw new Error('The Sidebar must be inside SidebarProvider');
  return motion;
}

/**
 * What the Sidebar shows, anywhere inside SidebarProvider: `header` at its
 * top, `children` scrolling under it, `footer` at its foot. It is drawn
 * under the page, where SidebarProvider puts it, not here.
 */
export function Sidebar(props: {
  readonly header?: ReactNode;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}) {
  const { show } = useMotion();
  // Handed over after every render, so it shows what this render drew.
  useEffect(() => show(props));
  useEffect(() => () => show(undefined), [show]);
  return null;
}

/**
 * The Sidebar's swipe, inside a GestureSurface: a swipe right of one finger
 * from anywhere opens it under the finger and, let go, springs open or back
 * shut, as on the web; `onSwiped` hears which, as it lets go. A zone inside
 * that wants a swipe right keeps it, such as Pages past their first or a
 * row of pills scrolled from its start; a swipe from the left edge is
 * always the Sidebar's, and never scrolls. A swipe left, or of two fingers,
 * such as a Thumb Lock, is left to the others; open, a drag left shuts it.
 *
 * Which zone takes the swipe is decided on the JS thread; once it is the
 * Sidebar's, the page follows the finger on the UI thread, in the frame it
 * moves, however busy the JS thread is.
 */
export function SidebarSwipe(props: {
  readonly onSwiped?: (open: boolean) => void;
}) {
  const sidebar = useSidebar();
  const motion = useMotion();
  const latest = useRef({ sidebar, motion, props });
  latest.current = { sidebar, motion, props };
  // Whether the page follows the finger: set on JS once the swipe is the
  // Sidebar's, read on the UI thread at each move.
  const following = useSharedValue(false);
  const width = useSharedValue(motion.width);
  useEffect(() => {
    width.value = motion.width;
  }, [width, motion.width]);
  const { progress } = motion;

  const claim = useRef<() => void>(() => {});
  const listener = useMemo(
    () =>
      sidebarSwipe({
        enabled: () => !latest.current.sidebar.open,
        onMove: (offset) => {
          if (following.value) return;
          // Caught up here once; the UI thread follows from the next move.
          following.value = true;
          progress.value = along(offset, latest.current.motion.width);
        },
        onEnd: (open, speed) => {
          following.value = false;
          const { settle: to, width } = latest.current.motion;
          to(open, speed / width);
          latest.current.props.onSwiped?.(open);
        },
        claim: () => claim.current(),
        clock: () => performance.now(),
      }),
    [following, progress],
  );
  claim.current = useGesture(listener).claim;

  useWorkletGesture(() => {
    'worklet';
    // Two fingers are never the Sidebar's: it stops following until the
    // touch is over, as the JS listener ends the swipe.
    let lone = true;
    return {
      enabled: () => true,
      start: () => {
        lone = true;
      },
      pointer: (_pointer, pointers) => {
        if (pointers.size > 1) lone = false;
      },
      move: (pointer) => {
        if (!lone || !following.value) return;
        progress.value = along(Math.max(0, pointer.dx), width.value);
      },
      end: () => {},
    };
  });
  return null;
}
