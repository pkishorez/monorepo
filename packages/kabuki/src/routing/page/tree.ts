import { routesOf } from '../route/index.ts';
import type {
  ChildrenOf,
  DataOf,
  Redirects,
  RouteOf,
  RoutesApi,
  RoutesOptions,
  Tree,
} from '../route/index.ts';
import type { AnyPage } from './page.ts';

/*
 * The Routes of an app, read down from its root page: `Route.tree(App)`.
 * Each page's place in the URL is its key in the `pages` of the page above,
 * its path joined to theirs; the root has none of its own.
 */

/** When a link preloads the Route it goes to: on hover or focus, once it scrolls into view, or never. */
export type Preload = 'intent' | 'viewport' | false;

export type TreeOptions<C, D> = RoutesOptions<C, D> & {
  /** When a `Router.Link` preloads, unless it says: `'intent'` by default. */
  readonly preload?: Preload;
  /** How long, in milliseconds, an `'intent'` link waits before it preloads: 50 by default. */
  readonly preloadDelay?: number;
};

/** What the Router needs of the root beside the Routes: the page itself, and the links' defaults. */
export interface Rooted<G extends AnyPage> {
  /** The root page: its Place is the Router's one Child. */
  readonly root: G;
  readonly preload: { readonly mode: Preload; readonly delay: number };
}

/** The root page is no place: a page with data is refused. */
type Rootless<G> = [DataOf<G>] extends [never]
  ? unknown
  : { readonly 'the root page has no data': never };

/** Names each page's Actor and Place after its key, for devtools and errors: the root's after `App`. */
const name = (page: AnyPage, as: string) => {
  for (const [actor, called] of [
    [page.actor, as],
    [page.place, `${as}Place`],
  ] as const)
    if (actor.name === 'Page' || actor.name === 'Place') {
      (actor as { name: string }).name = called;
      (actor.definition as { name: string }).name = called;
    }
  for (const [key, child] of Object.entries(
    page.children as Record<string, AnyPage>,
  ))
    name(child, key);
};

/**
 * The Routes of the app whose root page is `root`, or of the page a function
 * gives, read when the Routes are first used: `Route.tree(() => App)` lets
 * the pages import the Routes, as long as none reads them while the modules
 * load. `redirect` names paths
 * that are never a place, each with the Route that replaces it; `metadata`
 * is the root's, under every place's, and `notFound` the not-found Route's;
 * `preload` and `preloadDelay` are every link's defaults.
 */
export const tree = <
  G extends AnyPage,
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
  options: TreeOptions<ChildrenOf<G>, D> & {
    readonly redirect?: D & Redirects<ChildrenOf<G>, D>;
  } = {},
): Tree<ChildrenOf<G>, RouteOf<ChildrenOf<G>>, {}> &
  RoutesApi<ChildrenOf<G>> &
  Rooted<G> => {
  const make = (page: G) => {
    if (page.input !== undefined)
      throw new Error(
        '[@kestack/kabuki/routing] the root page has no data: a Loader needs a place in the URL',
      );
    name(page, 'App');
    return Object.assign(routesOf(page.children as ChildrenOf<G>, options), {
      root: page,
      preload: {
        mode: options.preload ?? 'intent',
        delay: options.preloadDelay ?? 50,
      },
    });
  };
  if (typeof root !== 'function') return make(root);
  // Read the root when the Routes are first used, so its pages may import them.
  let made: ReturnType<typeof make> | undefined;
  const routes = () => (made ??= make((root as () => G)()));
  return new Proxy({} as ReturnType<typeof make>, {
    get: (_, key) => Reflect.get(routes(), key),
    has: (_, key) => Reflect.has(routes(), key),
    ownKeys: () => Reflect.ownKeys(routes()),
    getOwnPropertyDescriptor: (_, key) => {
      const found = Reflect.getOwnPropertyDescriptor(routes(), key);
      return found && { ...found, configurable: true };
    },
  });
};
