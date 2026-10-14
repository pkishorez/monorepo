import { Effect, Layer } from 'effect';
import { Loading, Route } from '../../routing/index.ts';
import type { LoadError } from '../../routing/route/index.ts';
import {
  loadable,
  readAsk,
  readInputs,
  readRoute,
  writeAsk,
  writeInputs,
  writeRoute,
} from './wire.ts';
import type { Answer, RoutesOnWire, Wanted } from './wire.ts';

/*
 * The Loader RPC: how the browser asks the server for the Inputs of the
 * places a move needs, all in one request. Made from the Routes, so it
 * cannot disagree with them: a place with an Input is one call, its params
 * the payload, its Input the answer, NotFound or Redirect its failure.
 *
 * It is a fixed JSON protocol over the Routes' Schemas rather than an
 * `effect/rpc` group: a move asks for all its places at once, which one
 * request with one answer says directly, a Loader is handed the very request
 * that asked, cookies and all, and the browser ships no RPC client.
 */

/** Where the Worker serves it. */
export const PATH = '/_kabuki/load';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, no-store',
    },
  });

const reason = (error: { readonly cause?: unknown }) =>
  error.cause instanceof Error ? error.cause.message : 'the ask is not JSON';

/**
 * The server's side: reads the places a request asks for, runs their
 * Loaders through `load`, all at once, and answers. A malformed ask is a
 * `400`; a Loader's defect fails the Effect, for the Worker to answer `500`.
 */
export const answer = (
  routes: RoutesOnWire,
  request: Request,
  load: (
    wanted: ReadonlyArray<Wanted>,
  ) => Effect.Effect<Readonly<Record<string, unknown>>, LoadError>,
): Effect.Effect<Response> => {
  const places = loadable(routes);
  return Effect.tryPromise(() => request.json()).pipe(
    Effect.flatMap((body) => Effect.try(() => readAsk(places, body))),
    Effect.matchEffect({
      onFailure: (error) => Effect.succeed(json({ error: reason(error) }, 400)),
      onSuccess: (wanted) =>
        load(wanted).pipe(
          Effect.map((inputs): Answer => ({
            _tag: 'Loaded',
            inputs: writeInputs(places, inputs),
          })),
          Effect.catch((error): Effect.Effect<Answer> =>
            Effect.succeed(
              error._tag === 'NotFound'
                ? { _tag: 'NotFound' }
                : { _tag: 'Redirect', route: writeRoute(routes, error.route) },
            ),
          ),
          Effect.map((answered) => json(answered)),
        ),
    }),
  );
};

/**
 * The browser's side: a `Loading` that asks the server, in one request per
 * move. A request that does not get an answer is a defect, so the Router
 * leaves the page as it is.
 */
export const client = (
  routes: RoutesOnWire,
  options: { readonly fetch?: typeof fetch; readonly url?: string } = {},
): Layer.Layer<Loading> => {
  const places = loadable(routes);
  const send = options.fetch ?? ((input, init) => fetch(input, init));
  return Layer.succeed(Loading, {
    load: (wanted) =>
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
          try: (signal) =>
            send(options.url ?? PATH, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                accept: 'application/json',
              },
              body: JSON.stringify(writeAsk(places, wanted)),
              signal,
            }),
          catch: (cause) => cause,
        }).pipe(Effect.orDie);
        if (!response.ok)
          return yield* Effect.die(
            new Error(
              `[@kestack/kabuki/start] the Loader RPC answered ${response.status}`,
            ),
          );
        const answered = (yield* Effect.tryPromise(() => response.json()).pipe(
          Effect.orDie,
        )) as Answer;
        if (answered._tag === 'NotFound')
          return yield* Effect.fail(Route.notFound());
        if (answered._tag === 'Redirect')
          return yield* Effect.fail(
            Route.redirect(readRoute(routes, answered.route) as never),
          );
        return readInputs(places, answered.inputs);
      }),
  });
};
