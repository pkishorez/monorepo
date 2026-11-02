import { Dialog } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';
import {
  animate,
  motion,
  type MotionValue,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from 'motion/react';
import type { ReactNode } from 'react';
import {
  GestureProvider,
  GestureZone,
  useSwipe,
} from '../../ui/input/index.ts';
import { SWIPE_DISMISS } from '../touch-layers/index.ts';

/*
 * Anything opened whole the way `ImageViewer` opens an image, so the two
 * read as one: over the page on the same dimmed and blurred backdrop,
 * fading in and gone at once, with no frame of its own. Its caption, and
 * a quieter line about it, sit at the top left; its buttons, the
 * caller's and then Close, in one pill at the top right. What it holds is
 * centred in the space between, a video or a document as big as it
 * needs; `VIEWER_SURFACE` gives it the image's own rounded edge and shadow.
 *
 * Escape, Close or a tap on the backdrop close it; focus stays inside
 * while it is open and goes back where it was once it closes. On touch, a
 * swipe down closes it as it closes an image: what it holds follows the
 * finger and the backdrop fades, and let go past the Touch Layers'
 * `SWIPE_DISMISS` it closes, short of it it springs back. A list scrolled
 * down inside scrolls back first, as in a Drawer.
 *
 * `Viewer` is the overlay; `ViewerTool` a button for its pill, and for
 * `ImageViewer`'s. `Chrome`, `POPUP` and `BACKDROP` are the parts the two
 * share.
 */

/** The overlay: over the page, fading in, gone at once once closed. */
export const POPUP =
  'fixed inset-0 z-50 h-dvh w-screen outline-none duration-200 ease-out data-open:animate-in data-open:fade-in-0 data-closed:hidden motion-reduce:animate-none';

/** The backdrop: the page dimmed and blurred behind. */
export const BACKDROP = 'absolute inset-0 bg-black/70 backdrop-blur-xl';

/** What is shown, as the image is: rounded, a faint light edge and a deep shadow. */
export const VIEWER_SURFACE =
  'rounded-lg shadow-[0_0_0_1px_rgb(255_255_255/0.12),0_12px_48px_rgb(0_0_0/0.5)]';

const SPRING = { type: 'spring', stiffness: 400, damping: 40 } as const;

/**
 * Anything, opened whole while `open`; `onClose` is called as the reader
 * closes it. `label` names it to a screen reader.
 */
export function Viewer({
  open,
  onClose,
  label,
  caption,
  detail,
  tools,
  children,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly label: string;
  /** Shown at the top left. */
  readonly caption?: string;
  /** A quieter line beside the caption, such as its name, kind and size. */
  readonly detail?: string;
  /** `ViewerTool`s, in the pill before Close. */
  readonly tools?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Popup data-slot="viewer" className={POPUP}>
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          <GestureProvider>
            <GestureZone className="relative h-full w-full overflow-hidden">
              <Stage onClose={onClose}>{children}</Stage>
              <Chrome caption={caption} detail={detail} shown>
                {tools}
                <ViewerTool label="Close" onClick={onClose}>
                  <XIcon />
                </ViewerTool>
              </Chrome>
            </GestureZone>
          </GestureProvider>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The backdrop and what is shown on it, swiped down and away on touch. */
function Stage({
  onClose,
  children,
}: {
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const y = useMotionValue(0);
  const backdrop = useTransform(y, (offset) => 1 - Math.min(1, offset / 400));
  return (
    <>
      <SwipeAway y={y} onClose={onClose} />
      <motion.div
        aria-hidden
        className={BACKDROP}
        style={{ opacity: backdrop }}
      />
      <motion.div
        // A click on the backdrop, not on what it shows, closes it.
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        style={{ y }}
        // Clear of the buttons above it: 12px down, 52px of them on touch.
        className="absolute inset-0 flex flex-col items-center justify-center px-4 pt-[calc(4rem+env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-14 sm:pb-14"
      >
        {children}
      </motion.div>
    </>
  );
}

/** The swipe down that closes it, following the finger. Drawn inside the zone, it draws nothing. */
function SwipeAway({
  y,
  onClose,
}: {
  readonly y: MotionValue<number>;
  readonly onClose: () => void;
}) {
  const reduced = useReducedMotion() === true;
  const swipe = useSwipe({
    direction: 'down',
    commit: SWIPE_DISMISS,
    onCommit: onClose,
    onCancel: () => (reduced ? y.jump(0) : void animate(y, 0, SPRING)),
  });
  useMotionValueEvent(swipe.offset, 'change', (offset) => {
    if (swipe.state === 'tracking' || offset > 0) y.jump(offset);
  });
  return null;
}

/**
 * The caption at the top left and the pill of buttons at the top right,
 * clear of a notch; both fade while `shown` is false, the pill staying
 * while it holds focus.
 */
export function Chrome({
  caption,
  detail,
  count,
  shown,
  onFocus,
  children,
}: {
  readonly caption?: string | undefined;
  readonly detail?: string | undefined;
  /** Which of several it is. */
  readonly count?: { readonly at: number; readonly total: number } | null;
  readonly shown: boolean;
  readonly onFocus?: () => void;
  readonly children: ReactNode;
}) {
  const fade =
    'opacity-0 transition-opacity duration-200 data-shown:opacity-100 motion-reduce:transition-none';
  const on = shown ? '' : undefined;
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 flex items-center gap-2 [margin-top:env(safe-area-inset-top)] [padding-right:env(safe-area-inset-right)] [padding-left:env(safe-area-inset-left)]">
      {(caption !== undefined || (count ?? null) !== null) && (
        <div
          data-shown={on}
          className={`flex h-13 min-w-0 items-center gap-2 rounded-full bg-black/60 px-4 text-white/90 data-shown:pointer-events-auto keyboard:h-10 ${fade}`}
        >
          {count != null && (
            <span aria-live="polite" className="shrink-0 text-xs tabular-nums">
              {count.at} of {count.total}
            </span>
          )}
          {caption !== undefined && (
            // Short of room, the detail gives way first.
            <span className="max-w-full shrink-0 truncate text-sm font-medium">
              {caption}
            </span>
          )}
          {detail !== undefined && (
            <span className="min-w-0 truncate text-xs text-white/60">
              {detail}
            </span>
          )}
        </div>
      )}
      <div
        // Its buttons are tapped, never part of a Gesture.
        data-zone-gesture="disabled"
        data-shown={on}
        onFocus={onFocus}
        className={`ml-auto flex shrink-0 items-center gap-1 rounded-full bg-black/60 p-1 text-white/90 focus-within:pointer-events-auto focus-within:opacity-100 data-shown:pointer-events-auto ${fade}`}
      >
        {children}
      </div>
    </div>
  );
}

/** A round button for the pill: 44px to a finger, 32px with a keyboard. */
export function ViewerTool({
  label,
  disabled,
  onClick,
  children,
}: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="focus-ring grid size-11 touch-manipulation place-items-center rounded-full transition-colors duration-150 hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-transparent keyboard:size-8 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}
