import {
  createContext,
  use,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode, RefCallback } from 'react';
import { useLive } from '../../react/index.ts';
import { nodesOn } from '../route/index.ts';
import type {
  Children,
  How,
  Place,
  ScrollMode,
  Value,
} from '../route/index.ts';
import { memory } from './memory.ts';
import type { Memory, Point } from './memory.ts';
import * as session from './session.ts';

/*
 * Scroll restoration: each Place puts its own Scroll areas back, and the
 * window is the deepest Place's. Nothing here is in the Snapshot, and none
 * of it runs while the app shows a past Step.
 *
 * 1. Remember  every area's position as it scrolls, in memory: on the entry
 *              drawn, or for its place, as its Page's mode says. Through a
 *              held move the entry drawn is still the one before it.
 * 2. Save      to the tab's session storage, with an Adapter, when an entry
 *              is left, the page is hidden, or the app goes.
 * 3. Restore   a Place's areas once, as it is drawn with its data: where
 *              they were on the entry the app came back to, or for the
 *              place, unless the move said `top` or `keep`. A new entry's
 *              areas start at the top, as new elements do.
 * 4. Window    on every move: back to where it was, once every Place on
 *              screen has its data; to the top for a push to another page
 *              under the root, and left as it is for a push that keeps it,
 *              as opening a post beside its list, and for a replace. A
 *              wheel, a touch or a key first wins.
 */

/** The name of a Place's area when it has one: `useScroll()`. */
const MAIN = 'main';
/** The window's name, as an area of the deepest Place. */
const WINDOW = 'window';

/** Runs once the frame drawn is laid out: the next animation frame, where there is one. */
const afterPaint = (run: () => void) =>
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(run)
    : setTimeout(run, 0);

/** What the Router hands Scrolling: its Routes, and the move shown. */
export interface ScrollingProps {
  readonly routes: {
    readonly root: { readonly scroll: ScrollMode | undefined };
    readonly children: object;
    readonly places: (route: never) => ReadonlyArray<Place>;
  };
  /** The Route drawn. */
  readonly route: { readonly _tag: string };
  /** The key of the entry shown. */
  readonly entry: string;
  readonly move: {
    readonly how: How;
    readonly scroll?: 'top' | 'keep' | undefined;
  };
  /** Whether a move is held: the entry may already be the one it goes to. */
  readonly pending: boolean;
  /** Whether an Adapter holds the address: the Memory is saved for a reload. */
  readonly attached: boolean;
  /** Whether the Adapter has said which entry the app opened at: before, its key is not known. */
  readonly loaded: boolean;
  readonly children: ReactNode;
}

/** A place on the Route drawn: its key, with its query, and its mode. */
interface Shown {
  readonly key: string;
  readonly mode: ScrollMode;
}

/** Every place on the Route drawn, by dotted name, the root's `''`, from the root down. */
const shownOn = (
  routes: ScrollingProps['routes'],
  route: ScrollingProps['route'],
): ReadonlyMap<string, Shown> => {
  let mode: ScrollMode = routes.root.scroll ?? 'entry';
  const shown = new Map<string, Shown>([
    ['', { key: JSON.stringify(['', {}]), mode }],
  ]);
  if (route._tag === 'NotFound') return shown;
  const nodes = nodesOn(routes.children as Children, route as Value);
  routes.places(route as never).forEach((place, at) => {
    mode = nodes[at]?.[1].scroll ?? mode;
    shown.set(place.name, {
      key: JSON.stringify([place.name, place.params]),
      mode,
    });
  });
  return shown;
};

/** What each Place reads of the Router's Scrolling. */
interface Frame {
  /** Whether an area may be remembered now: while the app is live. */
  readonly remembering: () => boolean;
  /** Where the app is: the entry shown and the move that led there. */
  readonly arrival: () => Arrival;
  readonly remember: (place: string, area: string, at: Point) => void;
  readonly recall: (
    place: string,
    area: string,
    entry: string,
  ) => Point | undefined;
  /** A Place says whether it has its data, for the window to wait on. */
  readonly ready: (place: object, ready: boolean) => void;
  readonly left: (place: object) => void;
}

interface Arrival {
  readonly entry: string;
  readonly move: ScrollingProps['move'];
}

const FrameContext = createContext<
  { readonly frame: Frame; readonly settled: boolean } | undefined
>(undefined);

/**
 * Around the app, inside the Router: remembers the window, puts it back on
 * every move, and hands each Place what it puts its own areas back from.
 */
export function Scrolling(props: ScrollingProps) {
  const live = useLive();
  const now = { props, live, shown: shownOn(props.routes, props.route) };
  const latest = useRef(now);
  latest.current = now;
  const state = useRef<{
    frame: Frame;
    save: () => void;
    readies: Map<object, boolean>;
    /** The window waits on the Places for its data, then is put back. */
    waiting: (() => void) | undefined;
    /** No window position is remembered from a move until it is put back. */
    settling: boolean;
    turn: number;
    last: string | undefined;
    /** The entry drawn: through a held move, still the one before it, so a scroll just before a click is kept for it. */
    entry: string;
    /** The key of the page under the root the last move drew: a push that keeps it keeps the window. */
    page: string | null;
  }>(undefined);
  if (!state.current) {
    let own: Memory | undefined;
    const readies = new Map<object, boolean>();
    const memoryOf = () =>
      (own ??= memory(
        latest.current.props.attached ? session.read() : undefined,
      ));
    const where = (place: string, area: string, entry: string) => {
      const shown = latest.current.shown.get(place);
      if (!shown || shown.mode === false) return undefined;
      return {
        entry: shown.mode === 'entry' ? entry : null,
        area: `${shown.key}#${area}`,
      };
    };
    const check = () => {
      const s = state.current!;
      if (s.waiting && [...readies.values()].every(Boolean)) s.waiting();
    };
    state.current = {
      save: () => {
        if (latest.current.props.attached && own) session.write(own.saved());
      },
      readies,
      waiting: undefined,
      settling: false,
      turn: 0,
      last: undefined,
      entry: props.entry,
      page: null,
      frame: {
        remembering: () => latest.current.live,
        arrival: () => ({
          entry: latest.current.props.entry,
          move: latest.current.props.move,
        }),
        remember: (place, area, at) => {
          const found = where(place, area, state.current!.entry);
          if (found) memoryOf().set(found, at);
        },
        recall: (place, area, entry) => {
          const found = where(place, area, entry);
          return found && memoryOf().get(found);
        },
        ready: (place, ready) => {
          readies.set(place, ready);
          check();
        },
        left: (place) => {
          readies.delete(place);
          check();
        },
      },
    };
  }
  const s = state.current;
  // Until the Adapter says which entry the app opened at, its key is not
  // known, so nothing is put back: in memory that is never, and nothing
  // is kept from before.
  const settled = props.move.how !== 'load' || props.loaded;

  // 1. Remember the window, and 2. save when the page is hidden or the app goes.
  useLayoutEffect(() => {
    const deepest = () => [...latest.current.shown.keys()].at(-1)!;
    const scrolled = () => {
      if (!s.frame.remembering() || s.settling) return;
      s.frame.remember(deepest(), WINDOW, [scrollX, scrollY]);
    };
    const interrupt = () => {
      if (!s.waiting) return;
      s.waiting = undefined;
      s.turn += 1;
      s.settling = false;
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') s.save();
    };
    addEventListener('scroll', scrolled, { passive: true });
    addEventListener('pagehide', s.save);
    document.addEventListener('visibilitychange', hidden);
    for (const input of ['wheel', 'touchmove', 'keydown'] as const)
      addEventListener(input, interrupt, { passive: true });
    return () => {
      s.save();
      removeEventListener('scroll', scrolled);
      removeEventListener('pagehide', s.save);
      document.removeEventListener('visibilitychange', hidden);
      for (const input of ['wheel', 'touchmove', 'keydown'] as const)
        removeEventListener(input, interrupt);
    };
  }, [s]);

  // With an Adapter, Kabuki puts the window back, not the browser, unless the root says `false`.
  const owns =
    props.attached && (props.routes.root.scroll ?? 'entry') !== false;
  useLayoutEffect(() => {
    if (!owns || !('scrollRestoration' in history)) return;
    const before = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    return () => {
      history.scrollRestoration = before;
    };
  }, [owns]);

  // 4. Window
  const move = `${props.entry} ${props.move.how} ${props.move.scroll ?? ''} ${JSON.stringify(props.route)}`;
  useLayoutEffect(() => {
    if (!live || props.pending) return;
    s.entry = props.entry;
    if (s.last === move) return;
    s.last = move;
    s.save();
    s.waiting = undefined;
    const turn = (s.turn += 1);
    const done = () => {
      s.settling = false;
    };
    const { shown } = latest.current;
    const deepest = [...shown.keys()].at(-1)!;
    const page = [...shown.values()][1]?.key ?? null;
    const kept = page !== null && page === s.page;
    s.page = page;
    const mode = shown.get(deepest)!.mode;
    const { how, scroll } = props.move;
    if (!settled || mode === false || scroll === 'keep') return done();
    if (scroll === 'top') {
      scrollTo(0, 0);
      return done();
    }
    if (how === 'replace') return done();
    const at = s.frame.recall(deepest, WINDOW, props.entry);
    if (!at) {
      if (how === 'push' && !kept) scrollTo(0, 0);
      return done();
    }
    s.settling = true;
    s.waiting = () => {
      s.waiting = undefined;
      afterPaint(() => {
        if (s.turn !== turn) return;
        scrollTo(at[0], at[1]);
        done();
      });
    };
    if ([...s.readies.values()].every(Boolean)) s.waiting();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- `move` is the move, as one string.
  }, [move, props.pending, live, settled]);

  return (
    <FrameContext value={{ frame: s.frame, settled: settled && live }}>
      {props.children}
    </FrameContext>
  );
}

/** What `useScroll` registers its element with: the Place it is drawn in. */
interface Areas {
  readonly register: (area: string, element: Element) => () => void;
}

const PlaceContext = createContext<Areas | undefined>(undefined);

/**
 * Around each Place's View, written by `Route.view`: remembers its Scroll
 * areas and, 3., puts them back once it has its data.
 */
export function ScrollPlace({
  name,
  status,
  children,
}: {
  readonly name: string;
  /** Where its data is: an area is put back once it is not loading, and never for a page that failed. */
  readonly status: 'loading' | 'failed' | 'ready';
  readonly children: ReactNode;
}) {
  const found = use(FrameContext);
  const [self] = useState(() => ({
    areas: new Map<string, Element>(),
    restored: new Set<string>(),
    arrival: undefined as Arrival | undefined,
    status,
    settled: false,
  }));
  self.status = status;
  self.settled = found?.settled ?? false;

  const restore = useCallback(
    (area: string, element: Element) => {
      const frame = found?.frame;
      if (!frame || !self.settled || self.status === 'loading') return;
      if (self.restored.has(area)) return;
      self.restored.add(area);
      self.arrival ??= frame.arrival();
      const { entry, move } = self.arrival;
      if (self.status === 'failed' || move.scroll) return;
      const at = frame.recall(name, area, entry);
      if (!at) return;
      afterPaint(() => {
        // Scrolled first, by the user or the page itself: theirs wins.
        if (element.scrollLeft !== 0 || element.scrollTop !== 0) return;
        element.scrollTo(at[0], at[1]);
      });
    },
    [found, name, self],
  );

  useLayoutEffect(() => {
    found?.frame.ready(self, status !== 'loading');
    for (const [area, element] of self.areas) restore(area, element);
  }, [found, self, status, found?.settled, restore]);
  useLayoutEffect(() => () => found?.frame.left(self), [found, self]);

  const [areas] = useState<Areas>(() => ({
    register: (area, element) => {
      const before = self.areas.get(area);
      if (before && before !== element)
        throw new Error(
          `[@kestack/kabuki/routing] two Scroll areas are named "${area}" in ${name || 'the root'}: name each one`,
        );
      self.areas.set(area, element);
      const scrolled = () => {
        const frame = found?.frame;
        if (!frame?.remembering()) return;
        frame.remember(name, area, [element.scrollLeft, element.scrollTop]);
      };
      element.addEventListener('scroll', scrolled, { passive: true });
      restore(area, element);
      return () => {
        element.removeEventListener('scroll', scrolled);
        if (self.areas.get(area) === element) self.areas.delete(area);
      };
    },
  }));
  return <PlaceContext value={areas}>{children}</PlaceContext>;
}

/**
 * Marks an element as one of its Place's Scroll areas: spread the ref on
 * the element that scrolls. Where it was is remembered, and put back as its
 * Page's `scroll` says. A Place with more than one names each:
 * `useScroll('sidebar')`. The window is remembered without it.
 */
export const useScroll = (name: string = MAIN): RefCallback<Element> => {
  const areas = use(PlaceContext);
  if (!areas)
    throw new Error(
      '[@kestack/kabuki/routing] useScroll is drawn outside a page of a Router.app',
    );
  return useCallback(
    (element: Element | null) =>
      element ? areas.register(name, element) : undefined,
    [areas, name],
  );
};
