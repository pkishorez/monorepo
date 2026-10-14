import { Cause, Effect, Exit, Layer } from 'effect';
import { Loading, Router } from '../../routing/index.ts';
import type { Inputs, LoadError, Place } from '../../routing/route/index.ts';
import { PATH, answer } from '../loader-rpc/index.ts';
import type { Build } from '../page/index.ts';
import { kept } from './cache.ts';
import { drawer } from './draw.tsx';
import type { At } from './draw.tsx';
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
import type {
  AnyLoader,
  DocumentType,
  ServedApp,
  ServerLayer,
} from './served.ts';

/*
 * Start on the server: a Worker's `fetch`, which draws the page a URL names
 * and serves the Loaders to the browser. It never runs a Runtime.
 *
 * 1. Route    `POST /_kabuki/load` is the Loader RPC; a page is a `GET`.
 * 2. Read     the URL; a redirect in the Routes, or a URL not written as its
 *             Route is, is a `308` to the Route's URL.
 * 3. Split    the Route's places into those drawn here, static and dynamic,
 *             and those under the first client place, which the browser loads.
 * 4. Load     the Loaders of the places drawn here, all at once, with the
 *             request unless the place is static and the app's server Layer.
 *             Not found draws the not-found Route with a `404`; a Redirect is
 *             a `302`.
 * 5. Draw     the Router's init at the Route with those Inputs, as a History
 *             of one Restore, in the Document; see `draw.tsx`.
 * 6. Keep     a page whose places drawn here are all static, in the Cache
 *             under the build id; any other page, nowhere.
 */

export interface ServerOptions {
  /** The app the Router serves: what `Router.app(Routes, App)` gives. */
  readonly app: ServedApp;
  /** The HTML around the app, with `<Start.Head />` and `<Start.Scripts />` in it. */
  readonly document: DocumentType;
  /** The Loaders, as `Routes.loaders` types them; none if no place has an Input. */
  readonly loaders?: Readonly<Record<string, AnyLoader>>;
  /** What the Loaders Require: a Layer, or one made for each request from the Worker's env. */
  readonly layer?: ServerLayer;
  /** What the Vite plugin knows of the build. */
  readonly build: Build;
}

type Loaded =
  | { readonly _tag: 'Loaded'; readonly inputs: Inputs }
  | { readonly _tag: 'NotFound' }
  | { readonly _tag: 'Redirect'; readonly route: unknown };

/** The places drawn on the server: every place above the first client one. */
const drawnHere = (places: ReadonlyArray<Place>) => {
  const client = places.findIndex((place) => place.render === 'client');
  return client < 0 ? places : places.slice(0, client);
};

/** The path of a URL, without its query. */
const pathOf = (url: string, base: URL) => new URL(url, base).pathname;

export const server = (options: ServerOptions) => {
  const { app, build } = options;
  const loaders = options.loaders ?? {};
  const draw = drawer(app, options.document, build);
  const layerOf = (env: unknown): Layer.Layer<any, any, never> =>
    typeof options.layer === 'function'
      ? options.layer(env)
      : (options.layer ??
        (Layer.empty as unknown as Layer.Layer<any, any, never>));

  // 4. Load
  /** Runs the Loaders of `wanted` at once, as the memory Loading does, handed this request. */
  const load =
    (request: Request, env: unknown) =>
    (
      wanted: ReadonlyArray<{
        readonly name: string;
        readonly params: Readonly<Record<string, unknown>>;
      }>,
    ): Effect.Effect<Readonly<Record<string, unknown>>, LoadError> =>
      wanted.length === 0
        ? Effect.succeed({})
        : (Effect.gen(function* () {
            const loading = yield* Loading;
            return yield* loading.load(wanted);
          }).pipe(
            Effect.provide(
              Router.memory(app.routes, loaders as never, {
                request: () => request,
              }).pipe(Layer.provide(Layer.orDie(layerOf(env)))),
            ),
          ) as Effect.Effect<Readonly<Record<string, unknown>>, LoadError>);

  const loaded = async (
    request: Request,
    env: unknown,
    places: ReadonlyArray<Place>,
  ): Promise<Loaded> => {
    const exit = await Effect.runPromiseExit(
      load(request, env)(places.filter((place) => place.input)),
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

  const page = async (request: Request, env: unknown): Promise<Response> => {
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
      const answer = await loaded(request, env, here);
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
    return shared ? kept(SHARED, build.id!, url, drawPage) : drawPage();
  };

  return {
    /** Answers one request: a page, or the Loader RPC. A failure is logged and answered with a `500`. */
    fetch: async (request: Request, env?: unknown): Promise<Response> => {
      try {
        // 1. Route
        const { pathname } = new URL(request.url);
        if (pathname === PATH)
          return request.method === 'POST'
            ? await Effect.runPromise(
                answer(app.routes, request, load(request, env)),
              )
            : new Response(null, { status: 405, headers: { allow: 'POST' } });
        if (request.method === 'HEAD')
          return headOf(
            await page(new Request(request, { method: 'GET' }), env),
          );
        if (request.method !== 'GET') return notAllowed();
        return await page(request, env);
      } catch (error) {
        console.error('[@kestack/kabuki/start] a request failed:', error);
        return broken();
      }
    },
  };
};
