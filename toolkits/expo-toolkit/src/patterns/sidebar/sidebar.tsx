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
import { useGesture } from '../../input';
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
 * shut, as on the web. A zone inside that wants a swipe right keeps it,
 * such as Pages past their first or a row of pills scrolled from its start;
 * a swipe from the left edge is always the Sidebar's, and never scrolls. A
 * swipe left, or of two fingers, such as a Thumb Lock, is left to the
 * others; open, a drag left shuts it.
 */
export function SidebarSwipe() {
  const sidebar = useSidebar();
  const motion = useMotion();
  const latest = useRef({ sidebar, motion });
  latest.current = { sidebar, motion };
  const claim = useRef<() => void>(() => {});
  const listener = useMemo(
    () =>
      sidebarSwipe({
        enabled: () => !latest.current.sidebar.open,
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
