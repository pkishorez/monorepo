import { ChevronDownIcon } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  createContext,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  use,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Scrolled } from '../../scroller/index.ts';

/*
 * What opens and closes in a transcript, and how: one set of open ids for
 * the whole page, kept by the session; a click that opens unless it ended
 * a drag that selected text; a chevron that turns as it opens; and long
 * text that shows its start until asked for all of it.
 *
 * The set is handed down as one Opening that stays the same while folds
 * open and shut, and each fold reads only whether it is open (`useOpen`):
 * opening one draws that one again, not the whole transcript.
 *
 * An open fold's head sticks to the top while what it opens scrolls under
 * it, under the heads of the open folds around it, so it can be shut from
 * there (`useSticky`). What it opens grows in and shuts away by its height
 * (`Folded`). Opening or shutting, a fold keeps itself on the screen
 * (`useFoldInPlace`): what is on the screen stays still, and one shut from a
 * head stuck at the top first goes back to its own top, under that head,
 * so the head stays where it is and what it opened folds up into it.
 */

/** Which folds are open, by id. */
export interface Opening {
  readonly isOpen: (id: string) => boolean;
  readonly toggle: (id: string) => void;
  /** Calls back each time what is open changes. */
  readonly subscribe: (listener: () => void) => () => void;
}

/** Whether one fold is open, drawn again only as that changes. */
export const useOpen = (opening: Opening, id: string): boolean => {
  const read = () => opening.isOpen(id);
  return useSyncExternalStore(opening.subscribe, read, read);
};

/** Folds that never open, for what draws them on their own. */
export const SHUT: Opening = {
  isOpen: () => false,
  toggle: () => {},
  subscribe: () => () => {},
};

/**
 * The Opening of a set of open ids kept elsewhere, as by the session's
 * Model: the same one for as long as it is drawn, telling its folds as the
 * set changes.
 */
export const useOpening = (
  open: ReadonlyArray<string>,
  toggle: (id: string) => void,
): Opening => {
  const toggleNow = useRef(toggle);
  toggleNow.current = toggle;
  const [store] = useState(() => {
    let current = new Set(open);
    const listeners = new Set<() => void>();
    return {
      set: (next: ReadonlyArray<string>) => {
        if (next.length === current.size && next.every((id) => current.has(id)))
          return;
        current = new Set(next);
        for (const listener of listeners) listener();
      },
      opening: {
        isOpen: (id: string) => current.has(id),
        toggle: (id: string) => toggleNow.current(id),
        subscribe: (listener: () => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      } satisfies Opening,
    };
  });
  useLayoutEffect(() => store.set(open), [store, open]);
  return store.opening;
};

/**
 * A click opens or closes, unless it ended a drag that selected text. A
 * double click selects a word: its second click undoes what its first did.
 */
export const unlessSelecting =
  (toggle: () => void) => (event: MouseEvent<HTMLElement>) => {
    if (event.detail === 2) toggle();
    if (event.detail !== 1) return;
    if (window.getSelection()?.isCollapsed === false) return;
    toggle();
  };

/**
 * Where an open fold's head sticks: how far below the transcript's top, in
 * px, under the heads of the open folds it is in, and how deep it is in
 * them, the outer heads drawn over the inner as they slide up.
 */
interface Place {
  readonly top: number;
  readonly depth: number;
}

const Stuck = createContext<Place>({ top: 0, depth: 0 });

/** The most open folds deep a head is drawn over another's. */
const DEEPEST = 10;

/**
 * An open fold's head, stuck to the top while it is open: drawn by `Head`,
 * whose parent is the fold, `toggle` to open or shut it, and `Under`
 * around what it opens, for the heads inside.
 */
export function useSticky(open: boolean, toggle: () => void) {
  const place = use(Stuck);
  const head = useRef<HTMLDivElement>(null);
  const height = useHeight(head, open);
  const inPlace = useFoldInPlace();
  return {
    head,
    open,
    style: open
      ? { top: place.top, zIndex: DEEPEST - Math.min(place.depth, DEEPEST - 1) }
      : undefined,
    under: { top: place.top + height, depth: place.depth + 1 },
    toggle: () => {
      inPlace(head.current?.parentElement ?? null, open);
      toggle();
    },
  };
}

/**
 * Keeps a fold in place as it opens or shuts, called just before: what is
 * on the screen stays still, at the bottom too, so it opens and shuts
 * where it was clicked; and one about to shut, `open` now, with its top
 * gone up out of sight, as under a head stuck at the top, first has the
 * view go back to its top, under the heads stuck above it.
 */
export function useFoldInPlace() {
  const scroll = use(Scrolled);
  const { top } = use(Stuck);
  return (fold: Element | null, open: boolean) => {
    const scroller = scroll?.scroller;
    if (!scroll || !scroller || !fold) return;
    scroll.keepStill();
    if (!open) return;
    const by =
      scroller.getBoundingClientRect().top +
      top -
      (fold.getBoundingClientRect().top + fold.clientTop);
    if (by > 0.5) scroller.scrollTop -= by;
  };
}

/** How what a fold opens grows in and shuts away. */
const FOLDING = { duration: 0.2, ease: [0.2, 0, 0, 1] } as const;

/**
 * What an open fold opens, grown in and shut away by its height, at once
 * with reduced motion; drawn only while open or shutting. It clips only
 * up and down: heads inside still stick, and hovers reach past its sides.
 */
export function Folded({
  open,
  className,
  children,
}: {
  readonly open: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const reduced = useReducedMotion() === true;
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: 'auto' }}
          exit={{ height: 0 }}
          transition={reduced ? { duration: 0 } : FOLDING}
          className="overflow-y-clip"
        >
          <div className={className}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type Sticky = ReturnType<typeof useSticky>;

/** An element's height, in px, measured while `measuring` and as it changes. */
export function useHeight(
  element: RefObject<HTMLElement | null>,
  measuring = true,
) {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const at = element.current;
    if (!measuring || !at) return;
    const measure = () => setHeight(at.scrollHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(at);
    return () => observer.disconnect();
  }, [element, measuring]);
  return height;
}

/** An open fold's head, stuck to the top over what it opened. */
export function Head({
  sticky,
  className = '',
  children,
}: {
  readonly sticky: Sticky;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      ref={sticky.head}
      style={sticky.style}
      className={`${className} ${sticky.open ? 'sticky bg-background' : ''}`}
    >
      {children}
    </div>
  );
}

/** What an open fold opens: the heads inside stick under its own. */
export function Under({
  sticky,
  children,
}: {
  readonly sticky: Sticky;
  readonly children: ReactNode;
}) {
  return <Stuck value={sticky.under}>{children}</Stuck>;
}

/** Turns down as what it heads opens. */
export function Chevron({ open }: { readonly open: boolean }) {
  return (
    <ChevronDownIcon
      aria-hidden
      className={`size-3.5 shrink-0 opacity-60 transition-[rotate] duration-150 motion-reduce:transition-none ${open ? '' : '-rotate-90'}`}
    />
  );
}

/** Output longer than this many lines shows its start until asked for all. */
const SHOWN_LINES = 12;

/** Long text shows its first lines until asked for all of it. */
export function Clamped({
  id,
  opening,
  text,
  children,
}: {
  readonly id: string;
  readonly opening: Opening;
  readonly text: string;
  /** Draws the text shown; plain by default. */
  readonly children?: (shown: string) => ReactNode;
}) {
  const all = text.replace(/\n+$/, '').split('\n');
  const whole = useOpen(opening, id) || all.length <= SHOWN_LINES + 2;
  const shown = whole ? all.join('\n') : all.slice(0, SHOWN_LINES).join('\n');
  const button = useRef<HTMLButtonElement>(null);
  const inPlace = useFoldInPlace();
  return (
    <>
      {children ? children(shown) : shown}
      {all.length > SHOWN_LINES + 2 && (
        <button
          ref={button}
          type="button"
          // What it is in, as the text's top.
          onClick={() => {
            inPlace(button.current?.parentElement ?? null, whole);
            opening.toggle(id);
          }}
          className="focus-ring mt-1.5 block min-h-11 cursor-pointer rounded-sm font-sans text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground keyboard:min-h-0"
        >
          {whole ? 'Show less' : `Show all ${all.length} lines`}
        </button>
      )}
    </>
  );
}
