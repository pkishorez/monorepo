import { ChevronDownIcon } from 'lucide-react';
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
 * there (`useSticky`). Shut from there, what is under it moves up by as
 * much as the head had stuck down, so the head stays where it is.
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
  const inPlace = useShutInPlace();
  return {
    head,
    open,
    style: open
      ? { top: place.top, zIndex: DEEPEST - Math.min(place.depth, DEEPEST - 1) }
      : undefined,
    under: { top: place.top + height, depth: place.depth + 1 },
    // Shut, the head stays where it had stuck down to, on the screen, as
    // what it opened goes.
    toggle: () => {
      const element = head.current;
      const fold = element?.parentElement;
      if (open && element && fold)
        inPlace(
          element.getBoundingClientRect().top -
            fold.getBoundingClientRect().top -
            fold.clientTop,
        );
      toggle();
    },
  };
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

/**
 * Before a fold shuts while its top is above the view: what is on the
 * screen moves down by `by` px, as the view's anchor does, so what was
 * clicked to shut it stays where it was rather than going up out of
 * sight with what the fold hid.
 */
export function useShutInPlace() {
  const scroll = use(Scrolled);
  return (by: number) => {
    if (by < 1 || scroll?.anchor.at !== 'block') return;
    scroll.anchor = { ...scroll.anchor, offset: scroll.anchor.offset + by };
  };
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
  return (
    <>
      {children ? children(shown) : shown}
      {all.length > SHOWN_LINES + 2 && (
        <button
          type="button"
          onClick={() => opening.toggle(id)}
          className="focus-ring mt-1.5 block min-h-11 cursor-pointer rounded-sm font-sans text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground keyboard:min-h-0"
        >
          {whole ? 'Show less' : `Show all ${all.length} lines`}
        </button>
      )}
    </>
  );
}
