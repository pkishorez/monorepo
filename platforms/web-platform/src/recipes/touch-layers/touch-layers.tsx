import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Button } from '#components/button';
import { Drawer as DrawerRoot, DrawerContent } from '#components/drawer';
import { ChevronLeftIcon, XIcon } from '#kit/icons';
import { cn } from '#kit/class-names';
import {
  createContext,
  type ReactNode,
  type RefObject,
  use,
  useRef,
} from 'react';
import { raiseKeyboard, useFieldAtPress, useFocusOnOpen } from './focus.ts';
import { useLastLook } from './last-look.ts';
import { useVisibleViewport } from './visible-viewport.ts';

/*
 * Two layers for choosing on a device with no keyboard, each with a
 * header naming what is shown, and a way back when there is one.
 *
 * 1. Drawer      it rises from the bottom, and goes on a swipe down, a tap
 *                outside, or when its owner closes it, keeping what it drew
 *                while it slides away. It jumps instead under
 *                `prefers-reduced-motion`. As tall as its few choices, or,
 *                `tall`, three quarters of the screen whatever is in it, so
 *                a long list never changes its height as it loads; with
 *                the on-screen keyboard up, it sits above it, in the part
 *                of the page left visible.
 * 2. Top Dialog  a list worth searching: at the top, under the status bar,
 *                its search above the list, so the keyboard never covers a
 *                row. No motion, and no swipe closes it. A tap outside
 *                takes focus from a field in it first, and only closes it
 *                once nothing in it has focus. A field marked
 *                `data-autofocus` takes focus a frame after it is on
 *                screen, never as it appears; the tap that opens it calls
 *                `raiseKeyboard`, so the on-screen keyboard rises in the
 *                tap, as iOS needs, and is up for it.
 *
 * `LayerHeader` heads either: the title, a way back when there is one,
 * and, in a Top Dialog, a way to close it.
 *
 * Both size what is in them for a thumb: lists drawn with the Command
 * component get rows 56px tall, room around them and between them, and no
 * highlight but a pressed one, fields 48px tall with 16px text, so iOS
 * does not zoom.
 */

type Change = (
  open: boolean,
  details: {
    readonly reason: string;
    readonly cancel: () => void;
    readonly allowPropagation: () => void;
  },
) => void;

interface Layer {
  /** A Drawer three quarters of the screen tall, whatever is in it. */
  readonly tall?: boolean;
  /** Whether it shows; its owner decides. */
  readonly open: boolean;
  /** Asked to open or close, and why, as Base UI says: the owner decides. */
  readonly onOpenChange: Change;
  /** What it is called to a screen reader. */
  readonly label: string;
  readonly children: ReactNode;
}

const THUMB = cn(
  'flex min-h-0 flex-1 flex-col',
  // The row's text in line with the header's title, 20px in.
  '**:data-[slot=command]:p-0 **:data-[slot=command-input-wrapper]:px-4 **:data-[slot=command-input-wrapper]:pt-1 **:data-[slot=command-input-wrapper]:pb-3',
  '**:data-[slot=command-list]:pb-3 **:data-[slot=command-group]:px-2 **:data-[slot=command-group]:py-1 **:[[cmdk-group-heading]]:px-3! **:[[cmdk-group-heading]]:pt-3! **:[[cmdk-group-heading]]:pb-2!',
  '**:data-[slot=command-item]:min-h-14 **:data-[slot=command-item]:items-center **:data-[slot=command-item]:gap-3 **:data-[slot=command-item]:rounded-lg **:data-[slot=command-item]:px-3 **:data-[slot=command-item]:py-3 **:data-[slot=command-item]:text-base',
  '**:data-[slot=command-item]:data-selected:bg-transparent **:data-[slot=command-item]:active:bg-muted',
  '**:data-[slot=input-group]:h-12! **:[input]:text-base',
);

// Which layer a header is in: a Top Dialog's has a close button.
const InDialog = createContext(false);

/** 1. A layer rising from the bottom, closed by a swipe down or a tap outside. */
export function Drawer({
  open,
  onOpenChange,
  label,
  tall = false,
  children,
}: Layer) {
  const { live, look } = useLastLook(open);
  const visible = useVisibleViewport(open && tall);
  return (
    <DrawerRoot open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        style={visible}
        data-slot="touch-drawer"
        aria-label={label}
        initialFocus={false}
        finalFocus={false}
        className={cn(
          'pb-[max(0.5rem,env(safe-area-inset-bottom))] motion-reduce:transition-none sm:mx-auto sm:max-w-lg',
          tall &&
            // Above the keyboard, and gone past it as it slides away.
            'h-[min(75dvh,calc(var(--visible-height,100dvh)-env(safe-area-inset-top)-0.5rem))] max-h-none data-[swipe-direction=down]:bottom-(--visible-bottom,0px) data-[swipe-direction=down]:[--closed-transform:translate3d(0,calc(100%+var(--visible-bottom,0px)+var(--drawer-inset,0px)+2px),0)]',
        )}
      >
        {/* The grab handle: the whole Drawer swipes, this says so. */}
        <div aria-hidden className="flex shrink-0 justify-center pt-2 pb-1">
          <div className="h-1.25 w-9 rounded-full bg-muted-foreground/40" />
        </div>
        {open ? (
          <div ref={live} className={THUMB}>
            {children}
          </div>
        ) : (
          <div
            inert
            className={THUMB}
            dangerouslySetInnerHTML={{ __html: look }}
          />
        )}
      </DrawerContent>
    </DrawerRoot>
  );
}

/** 2. A layer at the top with a list to search, never in motion. */
export function TopDialog({ open, onOpenChange, label, children }: Layer) {
  const popup = useRef<HTMLDivElement>(null);
  const visible = useVisibleViewport(open);
  const field = useFieldAtPress(popup);
  const change: Change = (next, details) => {
    if (!next && details.reason === 'outside-press' && field.blurred())
      return details.cancel();
    onOpenChange(next, details);
  };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={change}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs dark:bg-black/75" />
        <DialogPrimitive.Popup
          ref={popup}
          data-slot="top-dialog"
          aria-label={label}
          initialFocus={false}
          finalFocus={false}
          style={visible}
          className={cn(
            'fixed inset-x-3 z-50 mx-auto flex max-w-lg flex-col overflow-hidden rounded-xl bg-dialog text-sm text-popover-foreground shadow-lg ring-1 ring-edge outline-none dark:shadow-black/60',
            // Under the status bar, in the part of the page left visible.
            'top-[calc(var(--visible-top,0px)+env(safe-area-inset-top)+0.5rem)]',
            // Room below to tap outside; with a field focused, the keyboard is there instead.
            'max-h-[calc(var(--visible-height,100dvh)-env(safe-area-inset-top)-0.5rem-max(4rem,env(safe-area-inset-bottom)+3rem))] has-[:is(input,textarea):focus]:max-h-[calc(var(--visible-height,100dvh)-env(safe-area-inset-top)-1rem)]',
          )}
        >
          <FocusOnOpen layer={popup} />
          <InDialog value>
            <div className={THUMB}>{children}</div>
          </InDialog>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export { raiseKeyboard };

function FocusOnOpen({
  layer,
}: {
  readonly layer: RefObject<HTMLElement | null>;
}) {
  useFocusOnOpen(layer);
  return null;
}

/**
 * The top of a Drawer or Top Dialog: what it shows now, a way back when
 * `onBack` is given, and, in a Top Dialog, a way to close it.
 */
export function LayerHeader({
  title,
  onBack,
}: {
  readonly title: ReactNode;
  /** Goes back one; without it there is nothing to go back to. */
  readonly onBack?: () => void;
}) {
  const dialog = use(InDialog);
  return (
    <div
      data-slot="layer-header"
      className={cn(
        'flex h-14 shrink-0 items-center gap-1 px-2',
        onBack === undefined && 'pl-5',
      )}
    >
      {onBack !== undefined && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back"
          onClick={onBack}
          className="size-11 text-muted-foreground"
        >
          <ChevronLeftIcon aria-hidden className="size-5" />
        </Button>
      )}
      {/* A Dialog's title names the page it is; a Drawer's, the list under it. */}
      <h2
        className={cn(
          'min-w-0 flex-1 truncate font-medium',
          dialog
            ? 'text-base text-foreground'
            : 'text-sm text-muted-foreground',
        )}
      >
        {title}
      </h2>
      {dialog && (
        <DialogPrimitive.Close
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close"
              className="size-11 text-muted-foreground"
            />
          }
        >
          <XIcon aria-hidden className="size-5" />
        </DialogPrimitive.Close>
      )}
    </div>
  );
}
