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
import { useSettled } from './settled.ts';
import { SwipeDown } from './swipe-down.tsx';
import { useVisibleViewport } from './visible-viewport.ts';

/*
 * Two layers for choosing on a device with no keyboard, each with a
 * header naming what is shown, and a way back when there is one.
 *
 * 1. Drawer      it rises from the bottom, and goes on a swipe down, a tap
 *                outside, or when its owner closes it, keeping what it drew
 *                while it slides away. The swipe is its own
 *                (`swipe-down.tsx`), so a Gesture Zone inside keeps its
 *                own ways. It jumps instead under
 *                `prefers-reduced-motion`. As tall as its few choices, or,
 *                `tall`, three quarters of the screen whatever is in it, so
 *                a long list never changes its height as it loads. With
 *                the on-screen keyboard up, either sits above it, in the
 *                part of the page left visible, and, a field in it
 *                focused, takes all of that but the status bar, so
 *                nothing in it is under the keyboard, nor any room kept
 *                for the home indicator the keyboard covers. Once risen, a Drawer holding a
 *                field is Settled (`settled.ts`): the keyboard and the
 *                page's scroll move and size it at once, never by its
 *                transition, and only a swipe or closing animates it.
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
  // A row is a finger's 44px, no taller, as a phone's own lists are.
  '**:data-[slot=command-item]:min-h-11 **:data-[slot=command-item]:items-center **:data-[slot=command-item]:gap-3 **:data-[slot=command-item]:rounded-lg **:data-[slot=command-item]:px-3 **:data-[slot=command-item]:py-1.5 **:data-[slot=command-item]:text-[15px]',
  '**:data-[slot=command-item]:data-selected:bg-transparent **:data-[slot=command-item]:active:bg-muted',
  '**:data-[slot=input-group]:h-12! **:[input]:text-base **:[textarea]:text-base',
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
  const visible = useVisibleViewport(open);
  const popup = useRef<HTMLDivElement>(null);
  const { settled, onOpenChangeComplete, onFocus } = useSettled(popup);
  return (
    <DrawerRoot
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      <DrawerContent
        ref={popup}
        style={visible}
        data-slot="touch-drawer"
        data-settled={settled ? '' : undefined}
        onFocus={onFocus}
        aria-label={label}
        initialFocus={false}
        finalFocus={false}
        className={cn(
          // The page's own background, not a grey sheet, set off by a soft
          // shadow and a hairline, with rounder top corners.
          'bg-background [--drawer-bleed-background:var(--color-background)] border-border/60 shadow-[0_-1px_2px_rgb(0_0_0/0.06),0_-8px_32px_rgb(0_0_0/0.18)] data-[swipe-direction=down]:rounded-t-[20px]',
          'pb-[max(0.5rem,var(--visible-safe-bottom,env(safe-area-inset-bottom)))] motion-reduce:transition-none sm:mx-auto sm:max-w-lg',
          // Settled, only a swipe and closing move it: the keyboard, at once.
          'motion-safe:data-settled:transition-transform',
          // Above the keyboard, and gone past it as it slides away.
          'data-[swipe-direction=down]:bottom-(--visible-bottom,0px) data-[swipe-direction=down]:[--closed-transform:translate3d(0,calc(100%+var(--visible-bottom,0px)+var(--drawer-inset,0px)+2px),0)]',
          tall
            ? 'h-[min(75dvh,calc(var(--visible-height,100dvh)-env(safe-area-inset-top)-0.5rem))] max-h-none'
            : // Room above to tap outside; a field focused, the keyboard is
              // below instead, and it may take the rest.
              'max-h-[calc(var(--visible-height,100dvh)-6rem)] has-[:is(input,textarea,[contenteditable=true]):focus]:max-h-[calc(var(--visible-height,100dvh)-env(safe-area-inset-top)-0.5rem)]',
        )}
      >
        <SwipeDown
          popup={popup}
          open={open}
          onClose={() => {
            let kept = false;
            onOpenChange(false, {
              reason: 'swipe',
              cancel: () => void (kept = true),
              allowPropagation: () => {},
            });
            return !kept;
          }}
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
        </SwipeDown>
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
        {/* Drawn even over another layer, such as a Drawer, which it dims too. */}
        <DialogPrimitive.Backdrop
          forceRender
          className="fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs dark:bg-black/75"
        />
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
