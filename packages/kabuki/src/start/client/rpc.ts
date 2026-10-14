import { Effect, Layer } from 'effect';
import { Loading, Route } from '../../routing/index.ts';
import {
  PATH,
  loadable,
  readInputs,
  readRoute,
  writeAsk,
} from '../common/index.ts';
import type { Answer, RoutesOnWire } from '../common/index.ts';

/*
 * The Loader RPC, asked: the `Loading` the Router uses in a browser, one
 * request per move for every place it needs. The protocol is
 * `common/wire.ts`.
 */

/**
 * The browser's side: a `Loading` that asks the server, in one request per
 * move. A request that does not get an answer is a defect, so the Router
 * leaves the page as it is.
 */
export const loading = (
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
