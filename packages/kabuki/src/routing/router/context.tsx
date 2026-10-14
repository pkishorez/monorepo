// oxlint-disable-next-line no-restricted-imports -- the Metadata is written to the document, which only an effect may touch.
import { createContext, use, useEffect } from 'react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { MANAGED, tagsOf } from '../route/index.ts';
import type { Failure, How, Inputs, Metadata } from '../route/index.ts';
import type { AnyRoute } from './navigation.ts';

/** One entry of the router's history: its Route, and the Inputs of its places by dotted name. */
export interface Entry<Route extends AnyRoute = AnyRoute> {
  readonly key: string;
  readonly route: Route;
  readonly inputs: Inputs;
  /** Why the Inputs it lacks did not come: the move to it broke. */
  readonly failed?: Failure;
}

/** A move the Router waits on while it loads the Inputs its places need: where to, and how. */
export interface Pending<Route extends AnyRoute = AnyRoute> {
  readonly to: Route;
  /** `load` fills the entry shown now: places it holds have no Input yet. */
  readonly how: 'push' | 'replace' | 'load';
}

/** What the router's View hands everything drawn below it: drawing data, read from the Snapshot shown. */
export interface Drawing {
  readonly href: (route: AnyRoute) => string;
  readonly entries: ReadonlyArray<Entry>;
  readonly at: number;
  readonly move: {
    readonly from: AnyRoute | null;
    readonly to: AnyRoute;
    readonly how: How;
  };
  readonly pending: Pending | null;
  /** Why the current entry lacks Inputs, if the move to it broke. */
  readonly failed: Failure | null;
  /** The app's failed screen, for a page with none of its own. */
  readonly failedScreen: ((failure: Failure) => ReactNode) | undefined;
  /** The Metadata the Routes give the current entry. */
  readonly metadata: Metadata;
  readonly go: (by: number) => void;
}

export const RouterContext = createContext<Drawing | undefined>(undefined);

export const useDrawing = (what: string): Drawing => {
  const drawing = use(RouterContext);
  if (!drawing)
    throw new Error(
      `[@kestack/kabuki/routing] ${what} is drawn outside a Router.app`,
    );
  return drawing;
};

/**
 * Writes the Metadata to the document after every move, when an Adapter
 * holds the address: the title, and every tag marked `data-kabuki`, which
 * replace the ones marked before. Tags nobody marked are left alone, and an
 * app routing in memory never touches the document.
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
  readonly children?: ReactNode;
};

/**
 * A link to a Route. It draws a plain `<a href>`, so a new tab, a copied
 * link and a crawler all see the real URL; the router catches a plain click.
 */
export function Link({ to, ...rest }: LinkProps) {
  const { href } = useDrawing('Router.Link');
  return <a {...rest} href={href(to)} />;
}

/** What a component drawn inside the app can read of the router, and its own Back and Forward. */
export interface RouterState<Route extends AnyRoute = AnyRoute> {
  readonly route: Route;
  readonly href: string;
  readonly entries: ReadonlyArray<Entry<Route>>;
  readonly at: number;
  readonly move: {
    readonly from: Route | null;
    readonly to: Route;
    readonly how: How;
  };
  /** The move the Router waits on while it loads, if any. */
  readonly pending: Pending<Route> | null;
  /** Why the current entry lacks Inputs, if the move to it broke. A link to it again retries. */
  readonly failed: Failure | null;
  readonly metadata: Metadata;
  readonly title: string | undefined;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly back: () => void;
  readonly forward: () => void;
  /** Move to entry `at` of the history. */
  readonly goTo: (at: number) => void;
}

/**
 * The router, for a component drawn inside a `Router.app`: an address bar, a
 * history list. Name the app's Route, `useRouter<Route>()` with
 * `type Route = typeof Routes.route.Type`, to read its Routes as that type:
 * every Route the Router holds is one of them.
 */
export const useRouter = <
  Route extends AnyRoute = AnyRoute,
>(): RouterState<Route> => {
  const drawing = useDrawing('useRouter');
  const { entries, at, go, move, pending, failed, metadata } = drawing;
  const route = entries[at]!.route;
  const state: RouterState = {
    route,
    href: drawing.href(route),
    entries,
    at,
    move,
    pending,
    failed,
    metadata,
    title: metadata.title,
    canGoBack: at > 0,
    canGoForward: at < entries.length - 1,
    back: () => go(-1),
    forward: () => go(1),
    goTo: (to) => go(to - at),
  };
  return state as RouterState<Route>;
};

/**
 * The move the Router waits on while it loads the Inputs of its places, or
 * `null`: for a progress bar. The page drawn is still the one before it.
 * `usePending<Route>()` reads its Route as the app's, as `useRouter` does.
 */
export const usePending = <
  Route extends AnyRoute = AnyRoute,
>(): Pending<Route> | null =>
  useDrawing('usePending').pending as Pending<Route> | null;
