// oxlint-disable-next-line no-restricted-imports -- the head is written to the document, which only an effect may touch.
import { createContext, use, useEffect, useState } from 'react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import type { Head as HeadOf, How } from '../route/index.ts';
import type { AnyRoute } from './navigation.ts';

/** One entry of the router's history. */
export interface Entry {
  readonly key: string;
  readonly route: AnyRoute;
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
  /** Whether an Adapter holds the address: the head is then written to the document. */
  readonly attached: boolean;
  /** The head the Routes give the current Route. */
  readonly head: HeadOf;
  readonly go: (by: number) => void;
  readonly title: {
    readonly set: (title: string | null) => void;
    readonly value: string | null;
  };
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

/** The title a page drew with `Router.Head`, kept by the router's View. */
export const useTitle = () => {
  const [value, set] = useState<string | null>(null);
  return { value, set };
};

/**
 * Writes the page's title to the document, when an Adapter holds the
 * address: an app routing in memory never touches the document.
 */
export function HeadWriter({ title }: { readonly title: string | undefined }) {
  useEffect(() => {
    if (title !== undefined) document.title = title;
  }, [title]);
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

/**
 * The page's title, from data the Routes cannot know, like a project's name.
 * The last one drawn wins over what the Routes say; it goes when it is no
 * longer drawn.
 */
export function Head({ title }: { readonly title: string }) {
  const { title: kept } = useDrawing('Router.Head');
  useEffect(() => {
    kept.set(title);
    return () => kept.set(null);
  }, [kept.set, title]);
  return null;
}

/** What a component drawn inside the app can read of the router, and its own Back and Forward. */
export interface RouterState {
  readonly route: AnyRoute;
  readonly href: string;
  readonly entries: ReadonlyArray<Entry>;
  readonly at: number;
  readonly move: Drawing['move'];
  readonly title: string | undefined;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly back: () => void;
  readonly forward: () => void;
  /** Move to entry `at` of the history. */
  readonly goTo: (at: number) => void;
}

/** The router, for a component drawn inside a `Router.app`: an address bar, a history list. */
export const useRouter = (): RouterState => {
  const drawing = useDrawing('useRouter');
  const { entries, at, go, move } = drawing;
  const route = entries[at]!.route;
  return {
    route,
    href: drawing.href(route),
    entries,
    at,
    move,
    title: drawing.title.value ?? drawing.head.title,
    canGoBack: at > 0,
    canGoForward: at < entries.length - 1,
    back: () => go(-1),
    forward: () => go(1),
    goTo: (to) => go(to - at),
  };
};
