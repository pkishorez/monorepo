import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { MouseEvent } from 'react';
import { useRouter } from '@kestack/kabuki/routing';
import { MenuIcon, XIcon } from 'lucide-react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerSwipeArea,
  DrawerTitle,
  DrawerTrigger,
} from '@kestack/web-platform/ui/components/drawer';
import { TOOLKITS } from '../../shared/index.ts';
import type { Route } from '../../shared/index.ts';
import { KabukiBrand } from './brand.tsx';
import { Sidebar } from './sidebar.tsx';
import { label, navRow } from './styles.ts';
import { ToolkitLink, inToolkit } from './toolkit-link.tsx';

/*
 * The menu below the `lg` width, a drawer from the left: inside kabuki, its
 * sidebar under its name; on the stack's home, the toolkits. It opens from
 * the button in the header, or by swiping right across the page. A phone
 * keeps the screen's very edge for its own Back, so a swipe from anywhere
 * opens it, once it is plainly sideways; where the edge does reach the
 * page, the menu follows the finger out from it. Swiping it back left, a
 * tap outside, Esc or following any link in it closes it.
 */

const never = () => () => {};

/**
 * The strip along the left edge that a swipe pulls the menu out from,
 * under the finger, where the phone leaves the edge to the page. It is
 * put on the page's body: inside the header, whose blur makes it the box
 * that fixed things are placed in, it would be the header's height. A
 * server has no body to put it on, so it comes once the page is running.
 */
function EdgeSwipe() {
  const running = useSyncExternalStore(
    never,
    () => true,
    () => false,
  );
  if (!running) return null;
  return createPortal(
    // Below the header, so the menu button stays a plain tap.
    <DrawerSwipeArea className="top-14 bottom-0 left-0 w-4 lg:hidden" />,
    document.body,
  );
}

/** How far right a finger travels, plainly sideways, to open the menu. */
const DISTANCE = 48;

/** Where a sideways drag is the page's own: code, demos, pictures, fields. */
const OWN =
  'pre, figure, input, textarea, select, [contenteditable], [data-slot=drawer-swipe-area]';

/** Whether something under the finger scrolls sideways itself. */
const scrollsSideways = (from: Element | null): boolean => {
  for (let at = from; at && at !== document.body; at = at.parentElement) {
    if (
      at.scrollWidth > at.clientWidth + 1 &&
      /auto|scroll/.test(getComputedStyle(at).overflowX)
    )
      return true;
  }
  return false;
};

/**
 * Opens the menu on a swipe right that starts anywhere on the page below
 * the `lg` width: once the finger has moved, it is a swipe if it went
 * right more than half again as far as it went up or down, and it opens
 * the menu as soon as it has gone `DISTANCE`. The page keeps scrolling as
 * ever: the listeners only watch.
 */
function useSwipeToOpen(open: boolean, onOpen: () => void) {
  // Touch listeners on the document: the page around React, given back.
  useEffect(() => {
    if (open) return;
    const wide = matchMedia('(min-width: 64rem)');
    let start: { readonly x: number; readonly y: number } | null = null;
    let sideways: boolean | null = null;
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      const target = event.target as Element;
      start =
        !wide.matches &&
        event.touches.length === 1 &&
        touch &&
        !target.closest(OWN) &&
        !scrollsSideways(target)
          ? { x: touch.clientX, y: touch.clientY }
          : null;
      sideways = null;
    };
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!start || !touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (sideways === null && Math.hypot(dx, dy) > 10)
        sideways = dx > 0 && dx > Math.abs(dy) * 1.5;
      if (sideways === false) start = null;
      else if (sideways && dx >= DISTANCE) {
        start = null;
        onOpen();
      }
    };
    const onEnd = () => {
      start = null;
    };
    const options = { passive: true } as const;
    document.addEventListener('touchstart', onStart, options);
    document.addEventListener('touchmove', onMove, options);
    document.addEventListener('touchend', onEnd, options);
    document.addEventListener('touchcancel', onEnd, options);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [open, onOpen]);
}

const openMenu = (set: (open: boolean) => void) => () => set(true);

export function MobileNav() {
  const { route } = useRouter<Route>();
  const kabuki = inToolkit(route, 'kabuki');
  const [open, setOpen] = useState(false);
  const [onOpen] = useState(() => openMenu(setOpen));
  useSwipeToOpen(open, onOpen);
  const closeOnLink = (event: MouseEvent) => {
    if ((event.target as Element).closest('a')) setOpen(false);
  };
  return (
    <Drawer open={open} onOpenChange={setOpen} swipeDirection="left">
      <DrawerTrigger
        aria-label="Open the menu"
        className="-ml-1.5 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring lg:hidden"
      >
        <MenuIcon className="size-4" />
      </DrawerTrigger>
      <EdgeSwipe />
      <DrawerContent className="flex h-dvh w-[min(20rem,85vw)] flex-col border-border bg-background p-0 shadow-[0_0_0_1px_rgb(0_0_0/0.04),16px_0_48px_-12px_rgb(0_0_0/0.45)]">
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border pr-3 pl-5">
          <DrawerTitle className="text-[15px] font-semibold tracking-tight">
            {kabuki ? (
              <span onClick={() => setOpen(false)}>
                <KabukiBrand />
              </span>
            ) : (
              'Menu'
            )}
          </DrawerTitle>
          <DrawerClose
            aria-label="Close the menu"
            className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <XIcon className="size-4" />
          </DrawerClose>
        </div>
        <div
          data-sidebar-scroll
          onClick={closeOnLink}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          {kabuki ? (
            <Sidebar />
          ) : (
            <section className="-mx-2 space-y-1.5">
              <h2 className={`${label} px-2`}>Toolkits</h2>
              <ul className="space-y-px">
                {TOOLKITS.map((toolkit) => (
                  <li key={toolkit.id}>
                    <ToolkitLink id={toolkit.id} className={navRow}>
                      {toolkit.name}
                    </ToolkitLink>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
