import { Context, Effect, Layer } from 'effect';
import type { LoadError, PlaceSchema } from '../route/index.ts';

/** A place to load: its dotted name and every param down to it. */
export interface Wanted {
  readonly name: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/**
 * The Capability the Router Requires, if the Layer has it, to load the
 * Inputs of the places a move needs: each by its dotted name, all at once.
 * In a browser under Start it is the Loader RPC's client; in a test, a
 * memory one. With none, a place with an Input is drawn only once it has one.
 */
export class Loading extends Context.Service<
  Loading,
  {
    readonly load: (
      places: ReadonlyArray<Wanted>,
    ) => Effect.Effect<Readonly<Record<string, unknown>>, LoadError>;
  }
>()('@kestack/kabuki/routing/Loading') {}

/** What `memory` needs of a Routes tree: every place, with its Render Mode. */
export interface RoutesWithPlaces {
  readonly every: ReadonlyArray<PlaceSchema>;
}

type AnyLoader = (
  params: never,
  request: Request,
) => Effect.Effect<unknown, LoadError, any>;

type ServicesOf<L> = {
  [K in keyof L]: L[K] extends (
    ...args: never
  ) => Effect.Effect<any, any, infer R>
    ? R
    : never;
}[keyof L];

/**
 * A `Loading` that runs the Loaders in place, as `Routes.loaders` types them:
 * for tests, stories and an app with no server. A dynamic or client place's
 * Loader is handed `request()`, a plain GET of `http://memory/` by default.
 */
export const memory = <L extends Readonly<Record<string, AnyLoader>>>(
  routes: RoutesWithPlaces,
  loaders: L,
  options?: { readonly request?: () => Request },
): Layer.Layer<Loading, never, ServicesOf<L>> =>
  Layer.effect(
    Loading,
    Effect.gen(function* () {
      const services = yield* Effect.context<ServicesOf<L>>();
      const modes = new Map(routes.every.map((place) => [place.name, place]));
      const request = options?.request ?? (() => new Request('http://memory/'));
      return {
        load: (places) =>
          Effect.forEach(
            places,
            (place) => {
              const loader = loaders[place.name] as AnyLoader | undefined;
              if (!loader)
                return Effect.die(
                  new Error(
                    `[@kestack/kabuki/routing] no Loader for ${place.name}`,
                  ),
                );
              const run =
                modes.get(place.name)?.render === 'static'
                  ? (loader as (params: unknown) => ReturnType<AnyLoader>)(
                      place.params,
                    )
                  : loader(place.params as never, request());
              return Effect.map(run, (input) => [place.name, input] as const);
            },
            { concurrency: 'unbounded' },
          ).pipe(
            Effect.map((answers) => Object.fromEntries(answers)),
            Effect.provideContext(services as Context.Context<unknown>),
          ) as Effect.Effect<Readonly<Record<string, unknown>>, LoadError>,
      };
    }),
  );
