import { Context, Effect, Exit, Layer, Scope, Stream } from 'effect';
import { Loading, Router } from '../../routing/index.ts';
import { knownOf } from '../../routing/page/index.ts';
import type { Known } from '../../routing/page/index.ts';
import type { Outcome, Place, RenderMode } from '../../routing/route/index.ts';
import {
  Document,
  PAGES,
  PATH,
  SHELL,
  appOf,
  pagesOf,
} from '../common/index.ts';
import type { Build, StartApp, Wanted } from '../common/index.ts';
import type { Handler, Host } from '../platform/index.ts';
import { kept } from './cache.ts';
import { drawer } from './draw.tsx';
import type { At } from './draw.tsx';
import { serverOf } from './layers.ts';
import type { StartServer } from './layers.ts';
import { answer } from './rpc.ts';
import { lifetimes } from './lifetimes.ts';
import {
  PRIVATE,
  SHARED,
  broken,
  found,
  headOf,
  html,
  notAllowed,
  permanent,
} from './respond.ts';

/*
 * Start on the server: the `Handler` a platform's adapter hands every
 * request, which draws the page a URL names and serves the Loaders to the
 * browser. It never runs a Runtime, and knows no platform: the adapter
 * hands it the env and the Cache, if there is one.
 *
 * 1. Route    `POST /_kabuki/load` is the Loader RPC; `GET /_kabuki/pages`
 *             the Pages and `GET /_kabuki/shell` the App Shell, kept as a
 *             static page is; see `common/pages.ts`. A page is a `GET`.
 * 2. Read     the URL; a redirect in the Routes, or a URL not written as its
 *             Route is, is a `308` to the Route's URL.
 * 3. Split    the Route's places into those drawn here, static and dynamic,
 *             and those under the first client place, which the browser loads.
 * 4. Load     the Loaders of the places drawn here, all at once, with the
 *             request unless the place is static, and their two Layers:
 *             the visitor only if a place is not static; see `lifetimes.ts`.
 *             A Redirect is a `302`, or a `308` if it says it is permanent,
 *             to its Route or the URL outside the app it names. Each other
 *             place starts from what its Loader came to: its data, or
 *             failed, so its page draws that; a place not found makes the
 *             page a `404`, one that broke a `500`.
 * 5. Draw     the Router's init at the Route, its places started from what
 *             they loaded, as a History of one Restore, in the Document; see
 *             `draw.tsx`. A client place starts loading, and its page draws
 *             its loading screen.
 * 6. Keep     a whole page whose places drawn here are all static, in the
 *             Cache under the build id; any other page, nowhere. Headers a
 *             Loader added go out with it.
 */

export interface HandlerOptions {
  /** What `src/app` default-exports: `Start.app(…)`. */
  readonly app: StartApp;
  /** What `src/loaders.server` default-exports: `Start.server({ loaders, … })`; none if no place has an Input. */
  readonly server?: StartServer;
  /** What the Vite plugin knows of the build. */
  readonly build: Build;
}

/** Runs the Loaders of the places asked for, at once, each answered on its own. */
type Load = (
  wanted: ReadonlyArray<Wanted>,
) => Effect.Effect<Readonly<Record<string, Outcome>>>;

/** The places drawn on the server: every place above the first client one. */
const drawnHere = (places: ReadonlyArray<Place>) => {
  const client = places.findIndex((place) => place.render === 'client');
  return client < 0 ? places : places.slice(0, client);
};

/** The path of a URL, without its query. */
const pathOf = (url: string, base: URL) => new URL(url, base).pathname;

export const handler = (options: HandlerOptions): Handler => {
  const { build } = options;
  const { app, document = Document } = appOf(options.app);
  const { loaders, layers } = serverOf(options.server);
  const draw = drawer(app, document, build);
  const layerFor = lifetimes(layers);
  const modes = new Map<string, RenderMode>(
    app.routes.every.map((place) => [place.name, place.render]),
  );

  // 4. Load
  /** What the Loaders of `wanted` run with: the memory Loading, handed this request, and their Layers. */
  const loadingFor = (
    request: Request,
    env: unknown,
    headers: Headers,
    wanted: ReadonlyArray<Wanted>,
  ) =>
    Router.memory(app.routes, loaders as never, {
      request: () => request,
    }).pipe(
      Layer.provide(
        layerFor({
          env,
          request,
          headers,
          visitor: wanted.some(({ name }) => modes.get(name) !== 'static'),
        }),
      ),
    ) as Layer.Layer<Loading>;

  /** Runs the Loaders of `wanted` at once, as the memory Loading does, handed this request. */
  const load =
    (request: Request, env: unknown, headers: Headers): Load =>
    (wanted) =>
      wanted.length === 0
        ? Effect.succeed({})
        : Effect.gen(function* () {
            const loading = yield* Loading;
            return yield* loading.load(wanted);
          }).pipe(Effect.provide(loadingFor(request, env, headers, wanted)));

  /**
   * The Loaders of `wanted`, each answered as it is done, for the Loader
   * RPC. What they run with is made first, so the headers it adds are there
   * before the answer starts; it is let go once the last place is answered.
   */
  const each =
    (request: Request, env: unknown, headers: Headers) =>
    async (wanted: ReadonlyArray<Wanted>) => {
      const scope = await Effect.runPromise(Scope.make());
      const close = Scope.close(scope, Exit.void);
      const context = await Effect.runPromise(
        Layer.buildWithScope(
          loadingFor(request, env, headers, wanted),
          scope,
        ).pipe(Effect.onError(() => close)),
      );
      const loading = Context.get(context, Loading);
      return (
        loading.each
          ? loading.each(wanted)
          : Stream.unwrap(
              Effect.map(loading.load(wanted), (answers) =>
                Stream.fromIterable(Object.entries(answers)),
              ),
            )
      ).pipe(Stream.ensuring(close));
    };

  /** What each place with data drawn here came to; a Redirect, the outermost first, instead. */
  const loaded = async (
    run: Load,
    places: ReadonlyArray<Place>,
  ): Promise<
    | Extract<Outcome, { readonly _tag: 'Redirect' }>
    | {
        readonly _tag: 'Loaded';
        readonly known: Readonly<Record<string, Known>>;
        readonly status: number;
      }
  > => {
    const wanted = places.filter((place) => place.input);
    const outcomes = await Effect.runPromise(
      run(wanted.map(({ name, params }) => ({ name, params }))),
    );
    const known: Record<string, Known> = {};
    let status = 200;
    for (const { name } of wanted) {
      const outcome: Outcome = outcomes[name] ?? {
        _tag: 'Broken',
        reason: `no answer for ${name}`,
      };
      if (outcome._tag === 'Redirect') return outcome;
      if (outcome._tag === 'NotFound') status = Math.max(status, 404);
      if (outcome._tag === 'Broken') {
        console.error(
          `[@kestack/kabuki/start] the Loader of ${name} broke:`,
          outcome.reason,
        );
        status = 500;
      }
      known[name] = knownOf(outcome, Date.now(), 'server')!;
    }
    return { _tag: 'Loaded', known, status };
  };

  // 5. Draw
  const drawn = async (at: At, status: number, cache: string) =>
    html(await draw.page(at), status, cache);

  const pages = JSON.stringify(
    pagesOf(app.routes.every, app.routes.paths(), build.id),
  );
  /** The App Shell, the same for everyone until the next deploy. */
  const shell = async (request: Request, host: Host) => {
    const drawShell = async () =>
      html(await draw.shell(), 200, build.id === undefined ? PRIVATE : SHARED);
    return build.id === undefined
      ? drawShell()
      : kept(host.cache, SHARED, build.id, new URL(request.url), drawShell);
  };

  const page = async (
    request: Request,
    host: Host,
    headers: Headers,
  ): Promise<Response> => {
    // 2. Read
    const url = new URL(request.url);
    const at = app.startAt(`${url.pathname}${url.search}`);
    if (!at) return new Response(null, { status: 404 });
    const route = at.route as { readonly _tag: string };
    const written = app.href(route);
    if (route._tag !== 'NotFound' && pathOf(written, url) !== url.pathname)
      return permanent(
        written.includes('?') ? written : `${written}${url.search}`,
      );

    // 3. Split
    const here = drawnHere(app.routes.places(route));
    const shared =
      build.id !== undefined &&
      here.every((place) => place.render === 'static');
    const cache = shared ? SHARED : PRIVATE;
    const drawPage = async () => {
      const answer = await loaded(load(request, host.env, headers), here);
      if (answer._tag === 'Redirect') {
        const to = answer.href ?? app.href(answer.route);
        return answer.permanent ? permanent(to) : found(to);
      }
      const status = route._tag === 'NotFound' ? 404 : answer.status;
      return drawn(
        { route, known: answer.known },
        status,
        status === 200 ? cache : PRIVATE,
      );
    };
    // 6. Keep
    return shared
      ? kept(host.cache, SHARED, build.id!, url, drawPage)
      : drawPage();
  };

  /** The response, with the headers the Loaders added. */
  const sent = (response: Response, headers: Headers) => {
    for (const [name, value] of headers) response.headers.append(name, value);
    return response;
  };

  return {
    fetch: async (request, host) => {
      try {
        const headers = new Headers();
        // 1. Route
        const { pathname } = new URL(request.url);
        if (pathname === PATH)
          return request.method === 'POST'
            ? sent(
                await answer(
                  app.routes,
                  request,
                  each(request, host.env, headers),
                ),
                headers,
              )
            : new Response(null, { status: 405, headers: { allow: 'POST' } });
        if (pathname === PAGES || pathname === SHELL) {
          if (request.method !== 'GET' && request.method !== 'HEAD')
            return notAllowed();
          const response =
            pathname === PAGES
              ? new Response(pages, {
                  headers: {
                    'content-type': 'application/json',
                    'cache-control': PRIVATE,
                  },
                })
              : await shell(request, host);
          return request.method === 'HEAD' ? headOf(response) : response;
        }
        if (request.method === 'HEAD')
          return headOf(
            sent(
              await page(
                new Request(request, { method: 'GET' }),
                host,
                headers,
              ),
              headers,
            ),
          );
        if (request.method !== 'GET') return notAllowed();
        return sent(await page(request, host, headers), headers);
      } catch (error) {
        console.error('[@kestack/kabuki/start] a request failed:', error);
        return broken();
      }
    },
  };
};
