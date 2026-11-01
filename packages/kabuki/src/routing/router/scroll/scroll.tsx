import {
  createContext,
  use,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useLive } from '../../../react/view/index.ts';
import { ID, WINDOW, elementOf, selectorOf } from './selector.ts';
import type { Position, Positions } from './selector.ts';
import * as session from './session.ts';

/*
 * Scroll restoration, as TanStack Router does it: the window and every
 * element the user scrolls are remembered under the history entry they
 * were scrolled on, and put back when the app comes back to it. Nothing is
 * marked and no page says anything; what deviates is said once, on the
 * Router, or on a move.
 *
 * 1. Track    every element the user scrolls, and the window, by its name
 *             (`data-scroll-restoration-id`, else its path in the document),
 *             with where it is, under the restoration key of the entry
 *             drawn: the entry's key unless `getScrollRestorationKey` says.
 * 2. Carry    on a move to another key, what is still on the page keeps
 *             where it was: its position is copied to the new key, not
 *             its anchor. Never the window, nor an element
 *             `scrollToTopSelectors` names.
 * 3. Restore  as the move lands, with whatever is drawn then: what is kept
 *             for the key it lands on is put back. With nothing for the
 *             window, a push or replace to a hash scrolls its element into
 *             view, else the window and `scrollToTopSelectors` go to the
 *             top. A move that says `resetScroll: false` touches nothing.
 * 4. Save     to the tab's session storage when the page is hidden, for a
 *             reload, which a server's inline script puts back before the
 *             app hydrates.
 *
 * A list that puts itself back, as a virtual one does, keeps an anchor
 * beside its position (`useKeepScrollAnchor`): where it was in its own
 * terms, as the item at its top, which outlasts its items changing height.
 * It reads the anchor back with `useElementScrollRestoration`, and 3.
 * restore leaves it alone. Only the list writes its anchor; a scroll of
 * the user's keeps it as it is.
 *
 * Kabuki's own: nothing here runs while the app shows a past Step. A page
 * that lands still loading may be too short to reach where it was: as in
 * TanStack Router, what is drawn when the move lands is what is restored.
 */

/** How an element is scrolled into view, as `Element.scrollIntoView` takes it. */
export type HashScroll =
  | boolean
  | {
      readonly behavior?: 'auto' | 'instant' | 'smooth';
      readonly block?: 'start' | 'center' | 'end' | 'nearest';
      readonly inline?: 'start' | 'center' | 'end' | 'nearest';
    };

/** Where an app is, as scroll restoration reads it. */
export interface ScrollLocation<Route = { readonly _tag: string }> {
  readonly route: Route;
  /** Its path and query, as the address writes it. */
  readonly path: string;
  /** The key of its history entry. */
  readonly key: string;
}

/** Scroll restoration's options on `Router.view`, named as TanStack Router's. */
export interface ScrollRestorationOptions<Route = { readonly _tag: string }> {
  /** Whether it restores scroll at all, or where: off unless said. */
  readonly scrollRestoration?:
    | boolean
    | ((options: { readonly route: Route }) => boolean);
  /** What positions are kept under: the entry's key unless said, its `path` to keep one per URL. */
  readonly getScrollRestorationKey?: (
    location: ScrollLocation<Route>,
  ) => string;
  /** Elements, by selector or function, that go to the top on a move to a new entry rather than keep where they were. */
  readonly scrollToTopSelectors?: ReadonlyArray<
    string | (() => Element | null | undefined)
  >;
  /** How it scrolls: `instant`, `smooth` or `auto`. */
  readonly scrollRestorationBehavior?: 'auto' | 'instant' | 'smooth';
  /** How a hash's element is scrolled into view when a move does not say: `true` unless said. */
  readonly defaultHashScrollIntoView?: HashScroll;
}

/** What the Router hands Scrolling: its options, and the move drawn. */
export interface ScrollingProps {
  readonly options: ScrollRestorationOptions<never>;
  /** Where the app is drawn. */
  readonly at: ScrollLocation;
  /** The element on the page its entry goes to. */
  readonly hash: string | undefined;
  readonly move: {
    readonly how: 'load' | 'push' | 'replace' | 'back' | 'forward';
    readonly resetScroll?: boolean | undefined;
    readonly hashScrollIntoView?: HashScroll | undefined;
  };
  /** Whether a move is held: the entry may already be the one it goes to. */
  readonly pending: boolean;
  /** Whether an Adapter holds the address: positions are saved for a reload. */
  readonly attached: boolean;
  /** Whether the Adapter has said which entry the app opened at: before, its key is not known. */
  readonly loaded: boolean;
  readonly children: ReactNode;
}

/** Whether scroll restoration is on at a Route. */
export const restores = (
  options: ScrollRestorationOptions<never>,
  route: unknown,
) =>
  typeof options.scrollRestoration === 'function'
    ? options.scrollRestoration({ route } as never)
    : options.scrollRestoration === true;

/** The restoration key of a location. */
export const keyOf = (
  options: ScrollRestorationOptions<never>,
  at: ScrollLocation,
) => options.getScrollRestorationKey?.(at as never) ?? at.key;

interface Frame {
  /** What is kept for an element or the window, under the key drawn. */
  readonly entry: (name: string) => Position | undefined;
  /** Keeps an element's, or the window's, anchor, under the key drawn. */
  readonly keep: (name: string, anchor: unknown) => void;
  /** The restoration key drawn: what is read is drawn again as it changes, as once a page load knows its entry. */
  readonly key: string;
}

const FrameContext = createContext<Frame | undefined>(undefined);

/**
 * Around the app, inside the Router: tracks what scrolls, and puts it back
 * as every move lands.
 */
export function Scrolling(props: ScrollingProps) {
  const live = useLive();
  const on = restores(props.options, props.at.route);
  const key = keyOf(props.options, props.at);
  const latest = useRef({ props, live, on });
  latest.current = { props, live, on };
  const [s] = useState(() => ({
    positions: undefined as Positions | undefined,
    /** Whether what the tab saved is read in: once the Adapter holds the address. */
    read: false,
    /** The restoration key drawn: through a held move, still the one before it. */
    key,
    /** Our own scrolling, which is not the user's. */
    ignore: false,
    /** The move last restored for, as one string. */
    last: undefined as string | undefined,
  }));
  // Read before the Adapter holds the address, as by a list drawn on a
  // page load, it starts empty; what the tab saved joins it once it does,
  // under it: what was kept since is newer, and an anchor it lacks stays.
  const positions = () => {
    if (latest.current.props.attached && !s.read) {
      s.read = true;
      s.positions = joined(session.read(), s.positions ?? {});
    }
    return (s.positions ??= {});
  };
  const save = () => {
    if (latest.current.props.attached && s.positions)
      session.write(s.positions);
  };
  // The entry drawn now: in the render that lands a move, already the one
  // it lands on, before 3. restore has run for it.
  const [frame] = useState<Omit<Frame, 'key'>>(() => ({
    entry: (name) =>
      positions()[
        keyOf(latest.current.props.options, latest.current.props.at)
      ]?.[name],
    keep: (name, anchor) => {
      if (!latest.current.live || !latest.current.on) return;
      const kept = (positions()[s.key] ??= {});
      kept[name] = { ...here(name, kept[name]), anchor };
    },
  }));

  // 1. Track, and 4. save.
  useLayoutEffect(() => {
    const scrolled = (event: Event) => {
      if (s.ignore || !latest.current.live || !latest.current.on) return;
      const target = event.target;
      const kept = (positions()[s.key] ??= {});
      let name: string;
      let position: Position;
      if (target === document || target === document.documentElement) {
        name = WINDOW;
        position = { scrollX, scrollY };
      } else if (target instanceof Element && target.isConnected) {
        name = selectorOf(target);
        position = { scrollX: target.scrollLeft, scrollY: target.scrollTop };
      } else return;
      const anchor = kept[name]?.anchor;
      kept[name] = anchor === undefined ? position : { ...position, anchor };
    };
    const hidden = () => {
      // The browser may put a reload back too; ours runs from what is saved.
      history.scrollRestoration = 'auto';
      save();
    };
    const shown = (event: PageTransitionEvent) => {
      if (event.persisted && latest.current.on)
        history.scrollRestoration = 'manual';
    };
    document.addEventListener('scroll', scrolled, {
      capture: true,
      passive: true,
    });
    addEventListener('pagehide', hidden);
    addEventListener('pageshow', shown);
    return () => {
      save();
      document.removeEventListener('scroll', scrolled, { capture: true });
      removeEventListener('pagehide', hidden);
      removeEventListener('pageshow', shown);
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- set up once; it reads the latest through refs.
  }, []);

  // Kabuki puts scroll back, not the browser, while it is on.
  const manual = on && props.attached;
  useLayoutEffect(() => {
    if (!manual || !('scrollRestoration' in history)) return;
    const before = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    return () => {
      history.scrollRestoration = before;
    };
  }, [manual]);

  // 2. Carry, and 3. restore, after every move.
  const settled = props.move.how !== 'load' || props.loaded;
  const move = `${key} ${props.move.how} ${props.hash ?? ''} ${props.at.path}`;
  useLayoutEffect(() => {
    if (!live || props.pending || !settled) return;
    const from = s.key;
    s.key = key;
    if (s.last === move) return;
    s.last = move;
    if (!on) return;
    const options = latest.current.props.options;
    const { how } = props.move;
    const reset = props.move.resetScroll !== false;
    const hashing = how === 'push' || how === 'replace';
    const hashScroll =
      props.move.hashScrollIntoView ??
      options.defaultHashScrollIntoView ??
      true;
    const kept = positions();
    let toTop: Set<Element> | undefined;
    const toTopElements = () =>
      (toTop ??= new Set(
        (options.scrollToTopSelectors ?? [])
          .filter((selector) => selector !== WINDOW)
          .map(elementOf)
          .filter((element): element is Element => element !== undefined),
      ));

    // 2. Carry
    const before = kept[from];
    if (before && from !== key) {
      const after = (kept[key] ??= {});
      for (const name in before) {
        if (name === WINDOW) {
          if (reset) continue;
        } else {
          const element = elementOf(name);
          if (!element) continue;
          if (reset && toTopElements().has(element)) continue;
        }
        // An anchor is the entry's it was kept on: only where it is goes on.
        const { scrollX, scrollY } = before[name]!;
        after[name] ??= { scrollX, scrollY };
      }
    }

    // 3. Restore
    {
      const behavior = options.scrollRestorationBehavior;
      const hash = props.hash;
      s.ignore = true;
      try {
        let windowRestored = false;
        if (reset) {
          const skipWindow = Boolean(hash && hashScroll && hashing);
          const tops = hash ? undefined : new Set(toTopElements());
          for (const name in kept[key] ?? {}) {
            const { scrollX: left, scrollY: top, anchor } = kept[key]![name]!;
            // What keeps an anchor puts itself back.
            const itself = anchor !== undefined;
            if (name === WINDOW) {
              if (skipWindow) continue;
              if (!itself)
                scrollTo({ top, left, ...(behavior ? { behavior } : {}) });
              windowRestored = true;
            } else {
              const element = elementOf(name);
              if (!element) continue;
              if (!itself) {
                element.scrollLeft = left;
                element.scrollTop = top;
              }
              tops?.delete(element);
            }
          }
          if (!hash) {
            const origin = {
              top: 0,
              left: 0,
              ...(behavior ? { behavior } : {}),
            };
            if (!windowRestored) scrollTo(origin);
            for (const element of tops ?? []) element.scrollTo(origin);
          }
        }
        if (!windowRestored && hash && hashScroll)
          document
            .getElementById(hash)
            ?.scrollIntoView(hashScroll === true ? undefined : hashScroll);
      } finally {
        s.ignore = false;
      }
    }

    // oxlint-disable-next-line react-hooks/exhaustive-deps -- `move` is the move, as one string.
  }, [move, props.pending, live, settled, on]);

  const drawn = useMemo<Frame>(() => ({ ...frame, key }), [frame, key]);
  return <FrameContext value={drawn}>{props.children}</FrameContext>;
}

/** What the tab saved, with what was kept since over it, element by element. */
const joined = (saved: Positions, since: Positions): Positions => {
  const all: Positions = { ...saved };
  for (const key in since) {
    const under = { ...saved[key] };
    for (const name in since[key])
      under[name] = { ...saved[key]?.[name], ...since[key]![name]! };
    all[key] = under;
  }
  return all;
};

/** Where an element, or the window, is now, as a position is kept. */
const here = (name: string, before: Position | undefined): Position => {
  if (name === WINDOW) return { scrollX, scrollY };
  const element = elementOf(name);
  return element
    ? { scrollX: element.scrollLeft, scrollY: element.scrollTop }
    : { scrollX: before?.scrollX ?? 0, scrollY: before?.scrollY ?? 0 };
};

/** An element, by its `data-scroll-restoration-id`, or handed over; or the window. */
type Named =
  | { readonly id: string }
  | { readonly getElement: () => Element | Window | null | undefined };

const nameOf = (options: Named): string | undefined => {
  if ('id' in options) return `[${ID}="${options.id}"]`;
  const element = options.getElement();
  if (!element) return undefined;
  return element === window ? WINDOW : selectorOf(element as Element);
};

/**
 * Where an element, or the window, was scrolled on the entry drawn, as kept
 * for it, with the anchor it kept: for a list that restores itself, as a
 * virtualized one does. Name it by its `data-scroll-restoration-id`, or
 * hand it over.
 */
export const useElementScrollRestoration = (
  options: Named,
): Position | undefined => {
  const frame = use(FrameContext);
  const name = frame && nameOf(options);
  return name === undefined ? undefined : frame!.entry(name);
};

/**
 * Keeps where a list that puts itself back is, in its own terms, as the
 * item at its top, under the entry drawn: `useElementScrollRestoration`
 * reads it back on that entry, and scroll restoration leaves the list to
 * put itself there. Anything JSON holds; the same each render.
 */
export const useKeepScrollAnchor = (
  options: Named,
): ((anchor: unknown) => void) => {
  const latest = useRef({ options, frame: use(FrameContext) });
  latest.current = { options, frame: use(FrameContext) };
  return useCallback((anchor: unknown) => {
    const { options, frame } = latest.current;
    const name = frame && nameOf(options);
    if (name !== undefined) frame!.keep(name, anchor);
  }, []);
};
