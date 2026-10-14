import { Effect, Layer, Scope } from 'effect';
import type { Context } from 'effect';
import { ResponseHeaders } from './layers.ts';
import type { Tiers } from './layers.ts';

/*
 * The Loaders' Layers, made as their tiers say:
 *
 * - instance  once, from the env of the first request that loads, and
 *             kept for every request after; made again if making it
 *             failed. A platform hands every request of an instance the
 *             same env, as a Worker's isolate does. It is never torn down:
 *             a platform ends an instance without a word.
 * - request   for each request that loads, on top of the instance's.
 * - visitor   for each request that loads a dynamic or client place, from
 *             the request itself, with the headers of its response; never
 *             for one whose places are all static.
 */

type Tier = Tiers['instance'] | Tiers['request'];

const made = (tier: Tier, env: unknown): Layer.Layer<any, unknown, never> =>
  (tier === undefined ? Layer.empty : tier(env)) as Layer.Layer<
    any,
    unknown,
    never
  >;

/** What one request's Loaders run with. */
export interface Asked {
  readonly env: unknown;
  readonly request: Request;
  /** The headers its response is sent with. */
  readonly headers: Headers;
  /** Whether it loads a dynamic or client place, which may use the visitor tier. */
  readonly visitor: boolean;
}

/** The Layer each request's Loaders run with, the instance tier made once for all of them. */
export const tiers = (layers: Tiers) => {
  let instance: Promise<Context.Context<any>> | undefined;
  const kept = (env: unknown) => {
    if (!instance) {
      const making = Effect.runPromise(
        Layer.buildWithScope(made(layers.instance, env), Scope.makeUnsafe()),
      );
      instance = making;
      making.catch(() => {
        if (instance === making) instance = undefined;
      });
    }
    return instance;
  };

  return (asked: Asked): Layer.Layer<any, never, never> =>
    Layer.unwrap(
      Effect.promise(() => kept(asked.env)).pipe(
        Effect.map((context) => {
          const shared = made(layers.request, asked.env).pipe(
            Layer.provideMerge(Layer.succeedContext(context)),
          );
          if (!asked.visitor) return shared;
          const above = Layer.merge(
            shared,
            Layer.succeed(ResponseHeaders, {
              append: (name, value) =>
                Effect.sync(() => asked.headers.append(name, value)),
            }),
          );
          return layers.visitor
            ? layers
                .visitor({ env: asked.env, request: asked.request })
                .pipe(Layer.provideMerge(above))
            : above;
        }),
      ),
    ).pipe(Layer.orDie) as Layer.Layer<any, never, never>;
};
