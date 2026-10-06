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
import {
  cancelAnimation,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useGesture } from '../../input';
import { edgeSwipe } from './edge';
import { along, opens, type Progress, settle, widthOn } from './motion';
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
  /** Records open or shut once the motion is already on its way there. */
  readonly opened: (open: boolean) => void;
  readonly show: (panel: Panel | undefined) => void;
};

const SidebarContext = createContext<SidebarState | undefined>(undefined);
const MotionContext = createContext<Motion | undefined>(undefined);

/**
 * The app with a Sidebar beside it, as on a phone on the web: `children` is
 * the page, which moves aside, shrinks, rounds and dims as the Sidebar under
 * it opens, springing from wherever a finger left it. Holds whether it is
 * open, for the Sidebar and anything that opens or shuts it: a menu button,
 * a Command, an edge swipe. Open, Android's back button shuts it.
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
    () => ({ progress, width, still, settle: move, opened: setOpenNow, show }),
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
 * The Sidebar's open as a drag another swipe hands on, such as a swipe
 * right on the first of some Pages: `move` opens it under the finger, `end`
 * springs it open or back shut as the finger lifts, by the edge swipe's
 * rule. Both are worklets, for a gesture on the UI thread.
 */
export function useSidebarDrag() {
  const { progress, width, still, opened } = useMotion();
  return useMemo(
    () => ({
      move: (offset: number) => {
        'worklet';
        progress.value = along(offset, width);
      },
      end: (offset: number, velocity: number) => {
        'worklet';
        const open = opens(offset, velocity);
        settle(progress, open ? 1 : 0, velocity / width, still);
        if (open) scheduleOnRN(opened, true);
      },
    }),
    [progress, width, still, opened],
  );
}

/**
 * The Sidebar's edge, inside a GestureSurface: a swipe right of one finger
 * from the left edge of the screen opens it under the finger and, let go,
 * springs open or back shut. The edge is its own, so a swipe there never
 * scrolls or goes back a page; a touch of two fingers, such as a Thumb Lock,
 * is left to the others.
 */
export function SidebarEdge(props: { readonly enabled?: boolean }) {
  const sidebar = useSidebar();
  const motion = useMotion();
  const latest = useRef({ sidebar, motion, enabled: props.enabled !== false });
  latest.current = { sidebar, motion, enabled: props.enabled !== false };
  const claim = useRef<() => void>(() => {});
  const listener = useMemo(
    () =>
      edgeSwipe({
        enabled: () => latest.current.enabled && !latest.current.sidebar.open,
        onMove: (offset) => {
          const { progress, width } = latest.current.motion;
          cancelAnimation(progress);
          progress.value = along(offset, width);
        },
        onEnd: (open, speed) => {
          const { settle: to, width } = latest.current.motion;
          to(open, speed / width);
        },
        claim: () => claim.current(),
        clock: () => performance.now(),
      }),
    [],
  );
  claim.current = useGesture(listener).claim;
  return null;
}
