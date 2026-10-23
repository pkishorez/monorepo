import { Effect, Layer, Scope } from 'effect';
import type { Context } from 'effect';
import { Env, Request, ResponseHeaders } from './layers.ts';
import type { Layers } from './layers.ts';

/*
 * The Loaders' two Layers, each made as long as it lasts:
 *
 * - layer    once, with the env of the first request that loads, and kept
 *            for every request after; made again if making it failed. A
 *            platform hands every request of an instance the same env, as
 *            a Worker's isolate does. It is never torn down: a platform
 *            ends an instance without a word.
 * - visitor  for each request that loads a dynamic or client place, with
 *            the request itself and the headers of its response; never for
 *            one whose places are all static.
 *
 * Every request's Loaders get `Start.Env` as that request's env.
 */

type Made = Layer.Layer<any, unknown, never>;

/** What one request's Loaders run with. */
export interface Asked {
  readonly env: unknown;
  readonly request: globalThis.Request;
  /** The headers its response is sent with. */
  readonly headers: Headers;
  /** Whether it loads a dynamic or client place, which may use the visitor. */
  readonly visitor: boolean;
}

/** The Layer each request's Loaders run with, the app's layer made once for all of them. */
export const lifetimes = (layers: Layers) => {
  let kept: Promise<Context.Context<any>> | undefined;
  const once = (env: unknown) => {
    if (!kept) {
      const layer = (layers.layer ?? Layer.empty) as Layer.Layer<
        any,
        unknown,
        Env
      >;
      const making = Effect.runPromise(
        Layer.buildWithScope(
          layer.pipe(Layer.provide(Layer.succeed(Env, env))),
          Scope.makeUnsafe(),
        ),
      );
      kept = making;
      making.catch(() => {
        if (kept === making) kept = undefined;
      });
    }
    return kept;
  };

  return (asked: Asked): Layer.Layer<any, never, never> =>
    Layer.unwrap(
      Effect.promise(() => once(asked.env)).pipe(
        Effect.map((context): Made => {
          const shared = Layer.merge(
            Layer.succeedContext(context),
            Layer.succeed(Env, asked.env),
          );
          if (!asked.visitor) return shared;
          const above = Layer.mergeAll(
            shared,
            Layer.succeed(Request, asked.request),
            Layer.succeed(ResponseHeaders, {
              append: (name, value) =>
                Effect.sync(() => asked.headers.append(name, value)),
            }),
          );
          return layers.visitor
            ? (layers.visitor as Made).pipe(Layer.provideMerge(above))
            : above;
        }),
      ),
    ).pipe(Layer.orDie) as Layer.Layer<any, never, never>;
};
