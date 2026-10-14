import { Cause, Effect, Exit, Layer } from 'effect';
import { Loading, Router } from '../../routing/index.ts';
import type {
  Inputs,
  LoadError,
  Place,
  RenderMode,
} from '../../routing/route/index.ts';
import { Document, PATH, appOf } from '../common/index.ts';
import type { Build, StartApp, Wanted } from '../common/index.ts';
import type { Handler, Host } from '../platform/index.ts';
import { kept } from './cache.ts';
import { drawer } from './draw.tsx';
import type { At } from './draw.tsx';
import { loadersOf } from './layers.ts';
import type { StartLoaders } from './layers.ts';
import { answer } from './rpc.ts';
import { tiers } from './tiers.ts';
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
 * 1. Route    `POST /_kabuki/load` is the Loader RPC; a page is a `GET`.
 * 2. Read     the URL; a redirect in the Routes, or a URL not written as its
 *             Route is, is a `308` to the Route's URL.
 * 3. Split    the Route's places into those drawn here, static and dynamic,
 *             and those under the first client place, which the browser loads.
 * 4. Load     the Loaders of the places drawn here, all at once, with the
 *             request unless the place is static, and their Layers' tiers:
 *             the visitor's only if a place is not static; see `tiers.ts`.
 *             Not found draws the not-found Route with a `404`; a Redirect is
 *             a `302`.
 * 5. Draw     the Router's init at the Route with those Inputs, as a History
 *             of one Restore, in the Document; see `draw.tsx`.
 * 6. Keep     a page whose places drawn here are all static, in the Cache
 *             under the build id; any other page, nowhere. Headers a Loader
 *             added go out with it.
 */

export interface ServerOptions {
  /** What `src/app` default-exports: `Start.app(…)`. */
  readonly app: StartApp;
  /** What `src/loaders.server` default-exports: `Start.layers()…loaders(…)`; none if no place has an Input. */
  readonly loaders?: StartLoaders;
  /** What the Vite plugin knows of the build. */
  readonly build: Build;
}

type Loaded =
  | { readonly _tag: 'Loaded'; readonly inputs: Inputs }
  | { readonly _tag: 'NotFound' }
  | { readonly _tag: 'Redirect'; readonly route: unknown };

/** Runs the Loaders of the places asked for, at once. */
type Load = (
  wanted: ReadonlyArray<Wanted>,
) => Effect.Effect<Readonly<Record<string, unknown>>, LoadError>;

/** The places drawn on the server: every place above the first client one. */
const drawnHere = (places: ReadonlyArray<Place>) => {
  const client = places.findIndex((place) => place.render === 'client');
  return client < 0 ? places : places.slice(0, client);
};

/** The path of a URL, without its query. */
const pathOf = (url: string, base: URL) => new URL(url, base).pathname;

export const server = (options: ServerOptions): Handler => {
  const { build } = options;
  const { app, document = Document } = appOf(options.app);
  const { loaders, tiers: given } = loadersOf(options.loaders);
  const draw = drawer(app, document, build);
  const layerFor = tiers(given);
  const modes = new Map<string, RenderMode>(
    app.routes.every.map((place) => [place.name, place.render]),
  );

  // 4. Load
  /** Runs the Loaders of `wanted` at once, as the memory Loading does, handed this request. */
  const load =
    (request: Request, env: unknown, headers: Headers): Load =>
    (wanted) =>
      wanted.length === 0
        ? Effect.succeed({})
        : (Effect.gen(function* () {
            const loading = yield* Loading;
            return yield* loading.load(wanted);
          }).pipe(
            Effect.provide(
              Router.memory(app.routes, loaders as never, {
                request: () => request,
              }).pipe(
                Layer.provide(
                  layerFor({
                    env,
                    request,
                    headers,
                    visitor: wanted.some(
                      ({ name }) => modes.get(name) !== 'static',
                    ),
                  }),
                ),
              ),
            ),
          ) as Effect.Effect<Readonly<Record<string, unknown>>, LoadError>);

  const loaded = async (
    run: Load,
    places: ReadonlyArray<Place>,
  ): Promise<Loaded> => {
    const exit = await Effect.runPromiseExit(
      run(places.filter((place) => place.input)),
    );
    if (Exit.isSuccess(exit)) return { _tag: 'Loaded', inputs: exit.value };
    const failure = Cause.findErrorOption(exit.cause);
    if (failure._tag === 'Some')
      return failure.value._tag === 'NotFound'
        ? { _tag: 'NotFound' }
        : { _tag: 'Redirect', route: failure.value.route };
    throw Cause.squash(exit.cause);
  };

  // 5. Draw
  const drawn = async (at: At, status: number, cache: string) =>
    html(await draw(at), status, cache);

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
      if (answer._tag === 'Redirect') return found(app.href(answer.route));
      if (answer._tag === 'NotFound')
        return drawn(
          { route: { _tag: 'NotFound', path: app.routes.path(route) } },
          404,
          cache,
        );
      return drawn(
        { route, inputs: answer.inputs },
        route._tag === 'NotFound' ? 404 : 200,
        cache,
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
                await Effect.runPromise(
                  answer(app.routes, request, load(request, host.env, headers)),
                ),
                headers,
              )
            : new Response(null, { status: 405, headers: { allow: 'POST' } });
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
