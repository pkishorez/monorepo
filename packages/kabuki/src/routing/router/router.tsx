import { Effect, Layer, Stream } from 'effect';
import type { ActorType, AnyActor, Types } from '../../core/actor/index.ts';
import type { ViewOf } from '../../react/view/index.ts';
import { Navigation } from '../capabilities/index.ts';
import {
  back,
  backTo,
  forward,
  preload,
  push,
  reload,
  replace,
} from '../capabilities/navigation/index.ts';
import type { AnyRoute } from '../capabilities/index.ts';
import type { AnyPageBuild } from '../page/index.ts';
import type { Known } from '../page/status/index.ts';
import type { Value } from '../route/index.ts';
import { KEY } from './adapter/index.ts';
import { Link, Retry } from './context.tsx';
import { shownOf } from './data.ts';
import { loadsOf } from './loads.ts';
import { define } from './define.ts';
import { definitionOf } from './model.ts';
import type {
  RouterInput,
  RouterMessage,
  RouterModel,
  RoutesLike,
  Send,
  Single,
} from './model.ts';
import { movesOf } from './moves.ts';
import { keyOf, restores, scriptFor } from './scroll/index.ts';
import { updatesOf } from './updates.ts';
import { urlsOf } from './urls.ts';
import { viewOf } from './view.tsx';
import { workersOf } from './workers.ts';

/**
 * The router of an app: one Actor, above the build of the app's root page,
 * drawn with the root page's View. It holds the history, as entries and
 * where it is in them, and hands the root page the current Route. Every
 * move is one Message to it: a link click, a Request on Navigation, the
 * Adapter's Back and Forward. A move to places whose data is not there yet
 * waits up to its delay while a Worker loads it through `Loading`, so a
 * quick answer, or a copy the Data cache kept, shows no loading screen;
 * after that the move lands and each new place loads its own. It holds the
 * data of every place on screen, `data.ts`, and hands each page its own as
 * `status`, down through the pages above it. It draws the app, catches
 * plain clicks on links inside it, preloads for links, and writes the
 * Metadata. With no Adapter in the Layer it routes in memory; with one, it
 * writes each move to the address with a Command, and hears the address
 * with a Worker.
 */
export const view = <Route extends AnyRoute, A extends AnyActor>(
  routes: RoutesLike<Route>,
  rootView: ViewOf<A>,
) => {
  const { scroll: scrolling } = routes.options;
  const root = rootView.actor as unknown as AnyPageBuild;
  if (root.page !== routes.root)
    throw new Error(
      '[@kestack/kabuki/routing] the View handed to the Router does not draw a build of its root page',
    );
  // Named for devtools and errors, as every page is after its key.
  if (root.name === 'Page') {
    (root as { name: string }).name = 'App';
    (root.definition as { name: string }).name = 'App';
  }
  const urls = urlsOf(routes);
  const moves = movesOf(routes, urls);
  const loads = loadsOf(routes, root);
  const { href, inside } = urls;
  const { shown } = moves;
  type Model = RouterModel<Route>;

  const built = (
    definitionOf(routes) as unknown as {
      readonly build: (behavior: object) => AnyActor;
    }
  ).build({
    init: (from: RouterInput<Route> | undefined) => ({
      model: moves.firstModel(from),
    }),
    children: {
      page: {
        actor: root,
        props: ({ model }: { readonly model: Model }) => {
          const route = shown(model) as unknown as Value;
          const found = route._tag !== 'NotFound';
          return {
            params: {},
            query: {},
            route: {
              name: '',
              ...(found ? { page: route } : {}),
              params: {},
              notFound: found ? null : String(route['path']),
              data: shownOf(routes, shown(model), model.data, model.reload),
            },
          };
        },
      },
    },
    provides: (self: {
      readonly send: Send<Route>;
      readonly changes: Stream.Stream<{ readonly model: Model }>;
    }) =>
      Layer.succeed(Navigation, {
        push: (to, options) =>
          self.send({
            _tag: 'Pushed',
            route: to as Route,
            ...options,
          }),
        replace: (to, options) =>
          self.send({
            _tag: 'Replaced',
            route: to as Route,
            ...options,
          }),
        back: self.send({ _tag: 'Went', by: -1 }),
        forward: self.send({ _tag: 'Went', by: 1 }),
        backTo: (to) => self.send({ _tag: 'WentBackTo', route: to as Route }),
        reload: (options) =>
          options?.anew === true && options.hold === true
            ? Effect.gen(function* () {
                yield* self.send({ _tag: 'Reloaded', ...options });
                // Sent while the Mailbox is still busy, the Message waits
                // its turn: past a yield, the Model is what it made.
                yield* Effect.yieldNow;
                yield* Stream.runHead(
                  Stream.filter(
                    self.changes,
                    ({ model }) => model.pending?.hold !== true,
                  ),
                );
              })
            : self.send({ _tag: 'Reloaded', ...options }),
        preload: (to) => self.send({ _tag: 'Preloading', route: to as Route }),
      }),
    on: updatesOf(urls, moves, loads),
    workers: workersOf(routes, urls, moves, loads),
  });

  const routerView = viewOf(
    built,
    rootView as unknown as ViewOf<AnyActor>,
    routes,
    urls,
    moves,
  );

  /**
   * The Router's Input at a URL, with what its places already start from:
   * for `View.app`'s `input`, so an app on an Adapter is drawn at the right
   * page from the first frame, and for a server, which draws a URL from what
   * its Loaders gave. With no URL, the browser's, if there is one. Places
   * that start from nothing load once the Runtime starts.
   */
  const startAt = (
    url?: string,
    known?: Readonly<Record<string, Known>>,
  ): RouterInput<Route> | undefined => {
    const at =
      url ??
      (typeof location === 'undefined'
        ? undefined
        : `${location.pathname}${location.search}`);
    if (at === undefined) return undefined;
    const within = inside(at);
    if (within === undefined) return undefined;
    const route = routes.read(within).route;
    return known ? { route, known } : { route };
  };

  type RouterActor = ActorType<
    'Router',
    RouterInput<Route> | undefined,
    void,
    RouterModel<Route>,
    Single,
    RouterMessage<Route>,
    { readonly Single: { readonly page: A } },
    Exclude<Types<A>['open'], Navigation>
  >;

  /** A key the Router never gives: what a custom key gives back when it keeps the entry's own. */
  const ENTRY = '\u0000entry';
  /**
   * The script a server writes in a page at `route`, run before the app
   * hydrates, that puts its scroll back from the tab's session storage, as
   * TanStack Start's does; `null` where scroll restoration is off.
   */
  const restoreScroll = (route: Route): string | null => {
    if (!restores(scrolling, route)) return null;
    const key = keyOf(scrolling, {
      route,
      path: routes.path(route),
      key: ENTRY,
    });
    return scriptFor(KEY, key === ENTRY ? undefined : key);
  };

  /*
   * The Router's View, with what an app and Start read of it: `input`, so
   * `View.app` starts it at the browser's URL; `startAt`, its Input at any
   * URL; `href`, a Route's URL; `restoreScroll`, the script a server writes;
   * and `routes`, what Start reads a URL and serves the Loaders with.
   */
  return Object.assign(routerView, {
    input: () => startAt(),
    startAt,
    href,
    restoreScroll,
    routes,
  }) as unknown as ViewOf<RouterActor> & {
    readonly input: () => RouterInput<Route> | undefined;
    readonly startAt: typeof startAt;
    readonly href: typeof href;
    readonly restoreScroll: typeof restoreScroll;
    readonly routes: typeof routes;
  };
};

/**
 * The router: `define` reads an app's router down from its root page's
 * definition; `view` puts it above the root page's View, as `Start.app`
 * does; `Link` and `Retry` draw inside it; `push`, `replace`, `back`,
 * `forward`, `backTo`, `reload` and `preload` are Commands an Update
 * returns.
 */
export const Router = {
  define,
  view,
  Link,
  Retry,
  push,
  replace,
  back,
  forward,
  backTo,
  reload,
  preload,
};
