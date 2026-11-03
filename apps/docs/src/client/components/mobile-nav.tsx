import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { MouseEvent } from 'react';
import { motion, useTransform } from 'motion/react';
import { useRouter } from '@kestack/kabuki/routing';
import { useSidebar } from '@kestack/web-platform/ui/input';
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  MenuIcon,
  XIcon,
} from 'lucide-react';
import { MONOREPO, PACKAGES } from '../../shared/index.ts';
import type { Route } from '../../shared/index.ts';
import { PackageBrand, PackageMark, StackBrand } from './brand.tsx';
import { Sidebar } from './sidebar.tsx';
import { PackageLink, packageAt } from './package-link.tsx';

/*
 * The menu below the `lg` width, a panel from the left: inside a package,
 * its sidebar under its name; on the stack's home, the bird's eye view:
 * under the stack's name, each package there is, and at the foot the code
 * and who made it. It opens from the button in the header, or on a touch
 * screen by a swipe right from anywhere on the page, the panel coming out
 * under the finger as far as it has gone; let go past a third and it
 * opens, short of it and it slides back. A swipe left, a tap outside, Esc
 * or following any link in it closes it. The swipe is the Web Platform's
 * `useSidebar`, which the Gesture Zone round the whole layout feeds.
 */

/**
 * Where the panel and its scrim are put: an element the layout keeps
 * inside its Gesture Zone. Inside the header, whose blur makes it the box
 * fixed things are placed in, they would be the header's height; and
 * outside the zone, a swipe on the panel would not be heard.
 */
export const MENU_HOST = 'mobile-menu-host';

const never = () => () => {};

/** How far the panel travels, in px: its width, unless the screen is narrower. */
const WIDTH = 304;

/** A touch screen below the `lg` width: where a swipe opens the menu. */
const SWIPES = '(pointer: coarse) and (max-width: 63.98rem)';

function useSwipes(): boolean {
  return useSyncExternalStore(
    useCallback((onChange: () => void) => {
      const query = matchMedia(SWIPES);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }, []),
    () => matchMedia(SWIPES).matches,
    () => false,
  );
}

export function MobileNav() {
  const { route } = useRouter<Route>();
  const here = packageAt(route);
  const swipes = useSwipes();
  const { x, progress, open, setOpen, dragging } = useSidebar({
    side: 'left',
    width: WIDTH,
    enabled: swipes,
  });
  // Seen only once any of it is out, so its shadow never shows at the edge.
  const visibility = useTransform(progress, (p) =>
    p > 0 ? 'visible' : 'hidden',
  );
  const scrim = useTransform(progress, [0, 1], [0, 0.45]);
  const close = useRef<HTMLButtonElement>(null);
  const shut = useRef(() => setOpen(false));
  shut.current = () => setOpen(false);
  // A server has no body to put the panel in, so it comes once running.
  const running = useSyncExternalStore(
    never,
    () => true,
    () => false,
  );

  // While it is open: Esc closes it, the page under it holds still, and
  // the keyboard starts on its close button. Given back as it shuts.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') shut.current();
    };
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    close.current?.focus({ preventScroll: true });
    return () => {
      root.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const host = running ? document.getElementById(MENU_HOST) : null;

  const closeOnLink = (event: MouseEvent) => {
    if ((event.target as Element).closest('a')) setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Open the menu"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen(true)}
        className="-ml-1.5 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring lg:hidden"
      >
        <MenuIcon className="size-4" />
      </button>
      {host &&
        createPortal(
          <>
            <motion.div
              aria-hidden
              onClick={() => setOpen(false)}
              style={{ opacity: scrim, visibility }}
              className={`fixed inset-0 z-50 bg-black lg:hidden ${open ? '' : 'pointer-events-none'}`}
            />
            <motion.div
              id="mobile-menu"
              role="dialog"
              aria-modal={open}
              aria-label="Menu"
              inert={!open && !dragging}
              style={{ x, visibility }}
              className="fixed inset-y-0 left-0 z-50 flex w-[19rem] max-w-[85vw] flex-col border-r border-border bg-background shadow-[16px_0_48px_-12px_rgb(0_0_0/0.45)] lg:hidden"
            >
              <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border pr-3 pl-5">
                <span
                  onClick={() => setOpen(false)}
                  className="text-[15px] font-semibold tracking-tight"
                >
                  {here ? <PackageBrand id={here} /> : <StackBrand />}
                </span>
                <button
                  ref={close}
                  type="button"
                  aria-label="Close the menu"
                  onClick={() => setOpen(false)}
                  className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <XIcon className="size-4" />
                </button>
              </div>
              <div
                data-sidebar-scroll
                onClick={closeOnLink}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
              >
                {here ? (
                  <Sidebar id={here} />
                ) : (
                  <ul className="space-y-2">
                    {PACKAGES.map((entry) => (
                      <li key={entry.id}>
                        <PackageLink
                          id={entry.id}
                          className="group flex items-center gap-3 rounded-xl border border-border bg-card/40 p-3 transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <PackageMark
                            id={entry.id}
                            className="size-9 shrink-0"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-semibold tracking-tight">
                              {entry.name}
                            </span>
                            <span className="block text-[13px] text-pretty text-muted-foreground">
                              {entry.pitch}
                            </span>
                          </span>
                          <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" />
                        </PackageLink>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {!here && (
                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-sm">
                  <a
                    href={MONOREPO}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-10 items-center gap-1 text-muted-foreground transition-colors duration-150 hover:text-foreground"
                  >
                    GitHub
                    <ArrowUpRightIcon className="size-3.5" />
                  </a>
                  <a
                    href="https://kishore.app"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-10 items-center gap-1 font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
                  >
                    kishore.app
                    <ArrowUpRightIcon className="size-3.5" />
                  </a>
                </div>
              )}
            </motion.div>
          </>,
          host,
        )}
    </>
  );
}
