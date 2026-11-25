import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Network } from 'lucide-react';
import { useIsMobile } from '#hooks/use-mobile';
import { cn } from '#kit/class-names';

/*
 * The Devtools Dialog: devtools over a page that cannot be laid out beside
 * them, as one fixed to the screen, opened from one button that never
 * moves. It wraps nothing: drawn beside the page, it never touches the
 * page's layout or its tree.
 *
 * 1. Keep    whether it is open, in `localStorage`, so a reload finds it
 *            as it was left.
 * 2. Over    open, the devtools fill the screen over the page, which stays
 *            where it is beneath them.
 * 3. Button  one icon, fixed in the bottom-right corner, of the Dock's size
 *            and place, that opens and closes them. The devtools' bottom
 *            bar is handed the room it takes as `--dock-reserve`. An app
 *            whose own controls sit in that corner on a phone turns
 *            `onPhones` off: there the button is not drawn and the devtools
 *            stay closed.
 * 4. Keys    Ctrl+/ or ⌘/ opens and closes them, unless the app keeps the
 *            key for itself; Escape closes them, unless something inside
 *            took it first, as a menu closing does.
 * 5. Hide    closed, they are hidden, not taken down: once opened they stay
 *            mounted, so what was chosen in them is there when they open
 *            again.
 */

export function DevtoolsDialog({
  devtools,
  label = 'Devtools',
  status,
  storageKey = 'devtools-dialog',
  shortcut = true,
  onPhones = true,
}: {
  /** The devtools, drawn full screen over the page. */
  readonly devtools: ReactNode;
  readonly label?: string;
  /** A mark on the button's corner, such as a dot for a page showing the past; it never changes the button's size. */
  readonly status?: ReactNode;
  /** Where the Dialog keeps whether it was left open. */
  readonly storageKey?: string;
  /** Whether Ctrl+/ or ⌘/ opens and closes them; off for an app that keeps the key for itself. */
  readonly shortcut?: boolean;
  /** Whether a phone gets the button and the devtools; off for an app whose own controls sit in the bottom-right corner there. */
  readonly onPhones?: boolean;
}) {
  // 1. Keep
  const [kept, setKept] = useState(false);
  // Read after mount: the server renders it closed.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) setKept(JSON.parse(stored).open === true);
    } catch {}
  }, [storageKey]);
  const keep = (open: boolean | ((was: boolean) => boolean)) =>
    setKept((was) => {
      const next = typeof open === 'function' ? open(was) : open;
      try {
        localStorage.setItem(storageKey, JSON.stringify({ open: next }));
      } catch {}
      return next;
    });
  const phone = useIsMobile();
  // Not offered here: closed, and no button, whatever was kept.
  const away = phone && !onPhones;
  const open = kept && !away;
  // 5. Hide: mounted from the first open on, hidden while closed.
  const [mounted, setMounted] = useState(false);
  if (open && !mounted) setMounted(true);

  // 4. Keys
  const toggle = useRef(() => {});
  // Not offered here, the keys do nothing: nothing opens later unasked.
  toggle.current = () => {
    if (!away) keep((was) => !was);
  };
  useEffect(() => {
    if (!shortcut) return;
    const onKey = (event: KeyboardEvent) => {
      if (!((event.ctrlKey || event.metaKey) && event.key === '/')) return;
      event.preventDefault();
      toggle.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Read once every listener has had it: one inside may take it.
      setTimeout(() => {
        if (!event.defaultPrevented) keep(false);
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // 3. Button: how much room it takes from the corner.
  const button = useRef<HTMLDivElement>(null);
  const [reserve, setReserve] = useState(0);
  useEffect(() => {
    const at = button.current;
    if (!at) return;
    const measure = () =>
      setReserve(window.innerWidth - at.getBoundingClientRect().left);
    const observer = new ResizeObserver(measure);
    observer.observe(at);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
    // The button comes and goes with `away`: measured afresh each time.
  }, [away]);

  return (
    <>
      {/* 2. Over */}
      {mounted && (
        <div
          role="dialog"
          hidden={!open}
          aria-label={label}
          className="fixed inset-0 z-40"
          style={{ '--dock-reserve': `${reserve}px` } as CSSProperties}
        >
          {devtools}
        </div>
      )}

      {/* 3. Button: one size and place whatever is open, in the devtools' bottom row. */}
      {!away && (
        <div
          ref={button}
          className={cn(
            'bg-background fixed right-3 bottom-[9px] z-50 flex h-9 items-center rounded-md border transition-shadow duration-150',
            !open &&
              'shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_16px_-4px_rgb(0_0_0/0.12)]',
          )}
        >
          <button
            type="button"
            aria-pressed={open}
            aria-label={`${open ? 'Close' : 'Open'} ${label}`}
            title={`${open ? 'Close' : 'Open'} ${label} (Ctrl /${open ? ' or Esc' : ''})`}
            onClick={() => keep(!open)}
            className="text-muted-foreground hover:text-foreground aria-pressed:text-foreground aria-pressed:bg-muted relative grid h-full w-9 place-items-center rounded-[5px] transition-colors duration-150 outline-offset-2 focus-visible:outline-2 [&_svg]:size-4"
          >
            <Network />
            {status && (
              <span className="pointer-events-none absolute top-1.5 right-1.5">
                {status}
              </span>
            )}
          </button>
        </div>
      )}
    </>
  );
}
