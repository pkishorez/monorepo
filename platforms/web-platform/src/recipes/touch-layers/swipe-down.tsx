import { useMotionValueEvent } from 'motion/react';
import {
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
  useEffect,
} from 'react';
import {
  GestureProvider,
  GestureZone,
  useSwipe,
} from '../../ui/input/index.ts';

/*
 * The Drawer's swipe down, as a Gesture Zone around what it holds, so a
 * zone inside keeps its own ways, such as a Draft's sideways Swipe, and a
 * list scrolled down scrolls back first. Base UI's own swipe never starts.
 *
 * It follows the finger, through the Popup's own
 * `--drawer-swipe-movement-y`, with no transition; let go short, it
 * springs back by its transition; let go past `SWIPE_DISMISS`, it closes, and
 * slides the rest of the way from where it is. An owner that keeps it
 * open springs it back too.
 */

/**
 * Past this many px down, or flicked down this fast in px/s, a swipe
 * closes a sheet: the Gesture recognizers' own default, so a Drawer, and
 * any sheet of the app's own that takes it, go alike.
 */
export const SWIPE_DISMISS = { distance: 80, velocity: 500 } as const;

// Base UI's swipe starts from these on its Viewport: never here.
const keepFromBaseUi = (event: SyntheticEvent) => event.stopPropagation();

export function SwipeDown({
  popup,
  open,
  onClose,
  children,
}: {
  readonly popup: RefObject<HTMLDivElement | null>;
  readonly open: boolean;
  /** Asks its owner to close it: false when the owner keeps it open. */
  readonly onClose: () => boolean;
  readonly children: ReactNode;
}) {
  return (
    // The app's, when it has one; else its own.
    <GestureProvider>
      <GestureZone
        onPointerDown={keepFromBaseUi}
        onTouchStart={keepFromBaseUi}
        className="flex min-h-0 flex-1 flex-col"
      >
        <Following popup={popup} open={open} onClose={onClose} />
        {children}
      </GestureZone>
    </GestureProvider>
  );
}

function Following({
  popup,
  open,
  onClose,
}: {
  readonly popup: RefObject<HTMLDivElement | null>;
  readonly open: boolean;
  readonly onClose: () => boolean;
}) {
  const move = (offset: number) => {
    const element = popup.current;
    if (element === null) return;
    element.style.setProperty('--drawer-swipe-movement-y', `${offset}px`);
    element.style.transitionDuration = offset === 0 ? '' : '0s';
  };
  // Opened again, it starts where it rests.
  useEffect(() => {
    if (open) move(0);
  }, [open]);
  const swipe = useSwipe({
    direction: 'down',
    enabled: open,
    commit: SWIPE_DISMISS,
    onCommit: () => {
      if (!onClose()) return move(0);
      const element = popup.current;
      if (element === null) return;
      element.style.setProperty('--drawer-swipe-strength', '0.6');
      element.style.transitionDuration = '';
    },
    onCancel: () => move(0),
  });
  useMotionValueEvent(swipe.offset, 'change', (offset) => {
    if (swipe.state === 'tracking' || offset > 0) move(offset);
  });
  return null;
}
