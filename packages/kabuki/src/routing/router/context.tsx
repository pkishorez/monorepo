// oxlint-disable-next-line no-restricted-imports -- the Metadata is written to the document, and a link watches its hover and its place on screen: each only an effect may do.
import { createContext, use, useEffect, useRef } from 'react';
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  FocusEvent,
  MouseEvent,
  ReactNode,
  TouchEvent,
} from 'react';
import type {
  AnyRoute,
  MoveOptions,
  ReloadOptions,
} from '../capabilities/index.ts';
import type { Preload } from './define.ts';
import { MANAGED, tagsOf } from '../route/index.ts';
import type { How, Metadata } from '../route/index.ts';

/** One entry of the router's history: its key and its Route. */
export interface Entry<Route extends AnyRoute = AnyRoute> {
  readonly key: string;
  readonly route: Route;
  /** The element on the page it goes to, after its `#`. */
  readonly hash?: string;
}

/** A move the Router holds while it loads the data of its places: where to, and how; `reload` is a reload anew, on the Route shown. */
export interface Pending<Route extends AnyRoute = AnyRoute> {
  readonly to: Route;
  readonly how: 'push' | 'replace' | 'load' | 'back' | 'forward' | 'reload';
}

/** What the router's View hands everything drawn below it: drawing data, read from the Snapshot shown, and its Sends. */
export interface Drawing {
  readonly href: (route: AnyRoute) => string;
  readonly entries: ReadonlyArray<Entry>;
  readonly at: number;
  readonly move: {
    readonly from: AnyRoute | null;
    readonly to: AnyRoute;
    readonly how: How;
    /** `false`: the push or replace said to leave every scroll as it is. */
    readonly resetScroll?: boolean;
    /** How the push or replace said its hash's element is scrolled into view. */
    readonly hashScrollIntoView?: MoveOptions['hashScrollIntoView'];
  };
  readonly pending: Pending | null;
  /** The Metadata the Routes give the current entry, from its params alone. */
  readonly metadata: Metadata;
  readonly go: (by: number) => void;
  readonly reload: (options?: ReloadOptions) => void;
  readonly preload: (route: AnyRoute) => void;
  /** When a link preloads, unless it says. */
  readonly linkPreload: { readonly mode: Preload; readonly delay: number };
}

export const RouterContext = createContext<Drawing | undefined>(undefined);

/** What a link says its push leaves the scroll as: `false`, as it is. */
const RESET_SCROLL = 'data-reset-scroll';
/** How a link says its hash's element is scrolled into view, as JSON. */
const HASH_SCROLL = 'data-hash-scroll-into-view';

/** The link a plain click landed on, unless the click asks for something else: a new tab, a download, a full load. */
export const linkOf = (event: MouseEvent): HTMLAnchorElement | undefined => {
  if (event.defaultPrevented || event.button !== 0) return undefined;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return undefined;
  const link = (event.target as Element | null)?.closest?.('a');
  if (!(link instanceof HTMLAnchorElement) || !link.href) return undefined;
  if (link.hasAttribute('download')) return undefined;
  if (link.target && link.target !== '_self') return undefined;
  if (link.relList.contains('external')) return undefined;
  return link;
};

/** What a link clicked says besides where it goes: its hash, and what its `Router.Link` said of scroll. */
export const linkOptions = (link: Element, url: URL): MoveOptions => {
  const hash = decodeURIComponent(url.hash.slice(1));
  const said = link.getAttribute(HASH_SCROLL);
  let hashScrollIntoView: MoveOptions['hashScrollIntoView'];
  try {
    hashScrollIntoView = said === null ? undefined : JSON.parse(said);
  } catch {}
  return {
    ...(link.getAttribute(RESET_SCROLL) === 'false'
      ? { resetScroll: false }
      : {}),
    ...(hash ? { hash } : {}),
    ...(hashScrollIntoView === undefined ? {} : { hashScrollIntoView }),
  };
};

export const useDrawing = (what: string): Drawing => {
  const drawing = use(RouterContext);
  if (!drawing)
    throw new Error(
      `[@kestack/kabuki/routing] ${what} is drawn outside a Router.app`,
    );
  return drawing;
};

/**
 * Writes the Metadata to the document after every move, and when a page's
 * data comes: the title, and every tag marked `data-kabuki`, which replace
 * the ones marked before. Tags nobody marked are left alone, and an app
 * routing in memory never touches the document.
 */
export function MetadataWriter({ metadata }: { readonly metadata: Metadata }) {
  const tags = tagsOf(metadata);
  const written = JSON.stringify([metadata.title, tags]);
  useEffect(() => {
    if (metadata.title !== undefined) document.title = metadata.title;
    for (const old of document.head.querySelectorAll(`[${MANAGED}]`))
      old.remove();
    for (const { tag, attributes } of tags) {
      const element = document.createElement(tag);
      for (const [name, value] of Object.entries(attributes))
        element.setAttribute(name, value);
      document.head.append(element);
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- `written` is the Metadata, as one string.
  }, [written]);
  return null;
}

export type LinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'href'
> & {
  /** Where it goes: a Route, never a string. */
  readonly to: AnyRoute;
  /**
   * When it preloads its Route's data and code: on hover or focus, after
   * `preloadDelay`; once it scrolls into view; or never. The Routes' default
   * unless said, `'intent'` unless they say.
   */
  readonly preload?: Preload;
  /** How long, in milliseconds, an `'intent'` link waits before it preloads. */
  readonly preloadDelay?: number;
  /** `false`: its move leaves every scroll as it is, as opening a post below its list. */
  readonly resetScroll?: boolean;
  /** The element on the page it goes to, by id: `href` ends `#hash`. */
  readonly hash?: string;
  /** How that element is scrolled into view; `false` leaves it. */
  readonly hashScrollIntoView?: MoveOptions['hashScrollIntoView'];
  readonly children?: ReactNode;
};

/**
 * A link to a Route. It draws a plain `<a href>`, so a new tab, a copied
 * link and a crawler all see the real URL; the router catches a plain click.
 * It asks the Router to preload where it goes, as `preload` says: each ask
 * is one Message, so the Timeline shows it.
 */
export function Link({
  to,
  preload,
  preloadDelay,
  resetScroll,
  hash,
  hashScrollIntoView,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  onTouchStart,
  ...rest
}: LinkProps) {
  const drawing = useDrawing('Router.Link');
  const mode = preload ?? drawing.linkPreload.mode;
  const wait = preloadDelay ?? drawing.linkPreload.delay;
  const ref = useRef<HTMLAnchorElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef({ to, ask: drawing.preload });
  latest.current = { to, ask: drawing.preload };
  const href = `${drawing.href(to)}${hash ? `#${encodeURIComponent(hash)}` : ''}`;

  useEffect(() => {
    const link = ref.current;
    if (
      mode !== 'viewport' ||
      !link ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      seen.disconnect();
      latest.current.ask(latest.current.to);
    });
    seen.observe(link);
    return () => seen.disconnect();
  }, [mode, href]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const intend = () => {
    if (mode !== 'intent') return;
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => latest.current.ask(latest.current.to),
      wait,
    );
  };
  const drop = () => clearTimeout(timer.current);
  return (
    <a
      {...rest}
      ref={ref}
      href={href}
      {...(resetScroll === false ? { [RESET_SCROLL]: 'false' } : {})}
      {...(hashScrollIntoView === undefined
        ? {}
        : { [HASH_SCROLL]: JSON.stringify(hashScrollIntoView) })}
      onMouseEnter={(event: MouseEvent<HTMLAnchorElement>) => {
        intend();
        onMouseEnter?.(event);
      }}
      onMouseLeave={(event: MouseEvent<HTMLAnchorElement>) => {
        drop();
        onMouseLeave?.(event);
      }}
      onFocus={(event: FocusEvent<HTMLAnchorElement>) => {
        intend();
        onFocus?.(event);
      }}
      onBlur={(event: FocusEvent<HTMLAnchorElement>) => {
        drop();
        onBlur?.(event);
      }}
      onTouchStart={(event: TouchEvent<HTMLAnchorElement>) => {
        if (mode === 'intent') latest.current.ask(latest.current.to);
        onTouchStart?.(event);
      }}
    />
  );
}

/** What a component drawn inside the app can read of the router, and its own Back, Forward and reload. */
export interface RouterState<Route extends AnyRoute = AnyRoute> {
  readonly route: Route;
  readonly href: string;
  readonly entries: ReadonlyArray<Entry<Route>>;
  readonly at: number;
  readonly move: {
    readonly from: Route | null;
    readonly to: Route;
    readonly how: How;
    readonly resetScroll?: boolean;
    readonly hashScrollIntoView?: MoveOptions['hashScrollIntoView'];
  };
  /** The move the Router holds while it loads, if any. */
  readonly pending: Pending<Route> | null;
  readonly metadata: Metadata;
  readonly title: string | undefined;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly back: () => void;
  readonly forward: () => void;
  /** Move to entry `at` of the history. */
  readonly goTo: (at: number) => void;
  /** Load every page on screen again, its data shown meanwhile: a failed page retries. `{ anew: true }` drops the data shown, as a move does. */
  readonly reload: (options?: ReloadOptions) => void;
  /** Warm the Data cache for a Route. */
  readonly preload: (route: Route) => void;
}

/**
 * The router, for a component drawn inside a `Router.app`: an address bar, a
 * history list, a retry button. Name the app's Route,
 * `useRouter<Route>()` with `type Route = typeof router.route.Type`, to read
 * its Routes as that type: every Route the Router holds is one of them.
 */
export const useRouter = <
  Route extends AnyRoute = AnyRoute,
>(): RouterState<Route> => {
  const drawing = useDrawing('useRouter');
  const { entries, at, go, move, pending, metadata } = drawing;
  const route = entries[at]!.route;
  const state: RouterState = {
    route,
    href: drawing.href(route),
    entries,
    at,
    move,
    pending,
    metadata,
    title: metadata.title,
    canGoBack: at > 0,
    canGoForward: at < entries.length - 1,
    back: () => go(-1),
    forward: () => go(1),
    goTo: (to) => go(to - at),
    reload: drawing.reload,
    preload: drawing.preload,
  };
  return state as unknown as RouterState<Route>;
};

/**
 * A button that loads every page on screen again: for a failed page's
 * screen, so the page whose Loader broke retries. Any other button props
 * pass through.
 */
export function Retry({
  onClick,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { reload } = useDrawing('Router.Retry');
  return (
    <button
      {...rest}
      type={type}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) reload();
      }}
    />
  );
}
