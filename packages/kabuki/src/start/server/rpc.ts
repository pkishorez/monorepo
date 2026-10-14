import { Effect } from 'effect';
import type { LoadError } from '../../routing/route/index.ts';
import { loadable, readAsk, writeInputs, writeRoute } from '../common/index.ts';
import type { Answer, RoutesOnWire, Wanted } from '../common/index.ts';

/*
 * The Loader RPC, answered: the places a request asks for read with their
 * Schemas, their Loaders run at once, and the answer written with them.
 * The protocol is `common/wire.ts`.
 */

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
