import { routesOf } from '../route/index.ts';
import type {
  ChildrenOf,
  Metadata,
  Redirects,
  RouteOf,
  RoutesApi,
  Tree,
} from '../route/index.ts';
import type { AnyPageDefinition, Rootless } from '../page/index.ts';
import type { ScrollRestorationOptions } from '../scroll/index.ts';

/*
 * The router of an app, as a definition: `Router.define(App, { … })`. It is
 * read down from the root page's definition, so it knows every page and
 * every Route by type, and it imports no build and no View: anything may
 * import it, a page's build to move the app, a server to read a URL.
 *
 * Each page's place in the URL is its key in the `pages` of the page above,
 * its path joined to theirs; the root has none of its own.
 */

/** When a link preloads the Route it goes to: on hover or focus, once it scrolls into view, or never. */
export type Preload = 'intent' | 'viewport' | false;

/** How the Router behaves in the browser: where it is mounted, how long a move waits, links, scroll. */
export type RouterOptions<C, D> = {
  /** Paths that are never a place, each with the Route it is replaced by, from the params its path names. */
  readonly redirect?: Redirects<C, D>;
  /** The not-found Route's Metadata, over the root page's. */
  readonly notFound?: Metadata;
  /** Where the app is mounted, like `/app`: every link and URL is under it. */
  readonly base?: string;
  /** How long a move waits for its data, in milliseconds, before it lands and its pages show they are loading: 150 unless said. */
  readonly delay?: number;
  /** When a `Router.Link` preloads, unless it says: `'intent'` by default. */
  readonly preload?: Preload;
  /** How long, in milliseconds, an `'intent'` link waits before it preloads: 50 by default. */
  readonly preloadDelay?: number;
  /** How long, in milliseconds, a copy in the Data cache stays fresh, for every dynamic or client page that says none: 0 unless said. */
  readonly staleTime?: number;
  /** How many copies the Data cache keeps, the least recently used dropped first: 50 unless said. */
  readonly cacheSize?: number;
} & ScrollRestorationOptions<RouteOf<C>>;

/** What the Router reads of its definition besides the Routes. */
export interface Rooted<G extends AnyPageDefinition> {
  /** The root page's definition: its build is the Router's one Child. */
  readonly root: G;
  readonly options: {
    readonly base: string;
    readonly delay: number;
    readonly preload: { readonly mode: Preload; readonly delay: number };
    readonly cacheSize: number;
    readonly scroll: ScrollRestorationOptions<never>;
  };
}

/** The router of an app whose root page is `G`. */
export type RouterDefinition<G extends AnyPageDefinition> = Tree<
  ChildrenOf<G>,
  RouteOf<ChildrenOf<G>>,
  {}
> &
  RoutesApi<ChildrenOf<G>> &
  Rooted<G>;

export type AnyRouterDefinition = RoutesApi<any> & Rooted<AnyPageDefinition>;

/** The root page's Metadata, under every place's. */
const rootMetadata = (root: AnyPageDefinition): Metadata | undefined =>
  typeof root.metadata === 'function'
    ? root.metadata({}, undefined)
    : root.metadata;

/**
 * The router of the app whose root page is `root`, or the page a function
 * gives, read when the router is first used: a page whose definition and
 * build share a module may then import the router to move the app, as long
 * as nothing reads it while the modules load.
 */
export const define = <
  G extends AnyPageDefinition,
  const D extends Readonly<
    Record<
      string,
      (
        routes: Tree<ChildrenOf<G>, RouteOf<ChildrenOf<G>>, {}>,
        params: any,
      ) => RouteOf<ChildrenOf<G>>
    >
  > = {},
>(
  root: (G & Rootless<G>) | (() => G & Rootless<G>),
  options: RouterOptions<ChildrenOf<G>, D> & {
    readonly redirect?: D & Redirects<ChildrenOf<G>, D>;
  } = {},
): RouterDefinition<G> => {
  const make = (page: G): RouterDefinition<G> => {
    if (page.input !== undefined)
      throw new Error(
        '[@kestack/kabuki/routing] the root page has no data: a Loader needs a place in the URL',
      );
    const metadata = rootMetadata(page);
    const {
      redirect,
      notFound,
      base,
      delay,
      preload,
      preloadDelay,
      staleTime,
      cacheSize,
      ...scroll
    } = options;
    return Object.assign(
      routesOf(page.children as ChildrenOf<G>, {
        ...(redirect ? { redirect } : {}),
        ...(notFound ? { notFound } : {}),
        ...(metadata ? { metadata } : {}),
        ...(staleTime === undefined ? {} : { staleTime }),
      }),
      {
        root: page,
        options: {
          base: (base ?? '').replace(/\/$/, ''),
          delay: delay ?? 150,
          preload: { mode: preload ?? 'intent', delay: preloadDelay ?? 50 },
          cacheSize: cacheSize ?? 50,
          scroll: scroll as ScrollRestorationOptions<never>,
        },
      },
    ) as RouterDefinition<G>;
  };
  if (typeof root !== 'function') return make(root);
  // Read the root when the router is first used, so its pages may import it.
  let made: RouterDefinition<G> | undefined;
  const router = () => (made ??= make((root as () => G)()));
  return new Proxy({} as RouterDefinition<G>, {
    get: (_, key) => Reflect.get(router(), key),
    has: (_, key) => Reflect.has(router(), key),
    ownKeys: () => Reflect.ownKeys(router()),
    getOwnPropertyDescriptor: (_, key) => {
      const found = Reflect.getOwnPropertyDescriptor(router(), key);
      return found && { ...found, configurable: true };
    },
  });
};
