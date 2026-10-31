import { Cause, Clock, Context, Effect, Layer, Stream } from 'effect';
import type {
  LoadError,
  Outcome,
  PlaceSchema,
  RedirectError,
} from '../route/index.ts';
import { cached } from './cache.ts';

/** A place to load: its dotted name and what its Loader is handed, every path param down to it and its own query. */
export interface Wanted {
  readonly name: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/**
 * What loading one place came to, as `Loading` answers it. `stale` is a
 * copy the Data cache kept: shown at once, and loaded again behind it.
 * `at` is when the Data cache had the data arrive, in milliseconds since
 * the epoch; `cached` that it is a copy; `took` how long its load took.
 */
export type Answer = Outcome & {
  readonly stale?: boolean;
  readonly at?: number;
  /** From a copy the Data cache kept, not a load. */
  readonly cached?: boolean;
  /** How long, in milliseconds, from asking for it to its answer. */
  readonly took?: number;
};

/**
 * The Capability the Router uses, if the Layer has it, to
 * load the data of places: many at once, each answered on its own, never
 * failing. In a browser under Start it is the Loader RPC's client behind
 * the Data cache; in a test, a memory one. With none, a place with data
 * stays loading.
 */
export class Loading extends Context.Service<
  Loading,
  {
    /**
     * Loads each place: from a copy the Data cache keeps, else from its
     * Loader. `again`, behind a stale copy shown, never answers from a copy
     * but joins a load on its way; `fresh`, a reload's, joins nothing.
     */
    readonly load: (
      places: ReadonlyArray<Wanted>,
      options?: { readonly fresh?: boolean; readonly again?: boolean },
    ) => Effect.Effect<Readonly<Record<string, Answer>>>;
    /**
     * Loads the places at once, and answers each by its dotted name as it
     * comes, so a quick place never waits on a slow one. The Data cache
     * asks through this when there is one.
     */
    readonly each?: (
      places: ReadonlyArray<Wanted>,
    ) => Stream.Stream<readonly [string, Answer]>;
    /** Starts loading the places the Data cache has no copy of, to keep: nothing waits for it. */
    readonly preload?: (places: ReadonlyArray<Wanted>) => Effect.Effect<void>;
    /** Drops every copy the Data cache keeps. */
    readonly forget?: Effect.Effect<void>;
    /**
     * Keeps data a place already has, as if it had arrived `at`, now
     * unless said: what a server drew the page with, so Back to it is at
     * once. A copy already kept stays.
     */
    readonly keep?: (
      place: Wanted,
      data: unknown,
      at?: number,
    ) => Effect.Effect<void>;
  }
>()('@kestack/kabuki/routing/Loading') {
  /** A `Loading` that runs the Loaders in place: for tests, stories, a server, and an app with no server. */
  static get memory() {
    return memory;
  }
  /** A `Loading` with the Data cache in front of another: `Loading.cached(routes, inner)`. */
  static get cached() {
    return cached;
  }
}

type Answered = Answer;

export declare namespace Loading {
  /** What a place is answered with: its data, a failure, or a Redirect. */
  export type Answer = Answered;
}

/** A Loader's Redirect as an outcome: to its Route or its URL, and permanent only if it said so. */
const redirectOf = (error: RedirectError): Outcome => ({
  _tag: 'Redirect',
  ...(error.href === undefined ? { route: error.route } : { href: error.href }),
  ...(error.permanent ? { permanent: true } : {}),
});

/** A Loader's run as what it came to: its data, not found, a Redirect, or what broke. */
export const outcomeOf = <R>(
  run: Effect.Effect<unknown, LoadError, R>,
): Effect.Effect<Outcome, never, R> =>
  run.pipe(
    Effect.map((data): Outcome => ({ _tag: 'Loaded', data })),
    Effect.catch((error): Effect.Effect<Outcome> =>
      Effect.succeed(
        error._tag === 'NotFound' ? { _tag: 'NotFound' } : redirectOf(error),
      ),
    ),
    Effect.catchCause((cause) => {
      const error = Cause.squash(cause);
      return Effect.succeed<Outcome>({
        _tag: 'Broken',
        reason: error instanceof Error ? error.message : String(error),
      });
    }),
  );

/** What `memory` needs of a Routes tree: every place, with its Render Mode. */
export interface RoutesWithPlaces {
  readonly every: ReadonlyArray<PlaceSchema>;
  /** The Router's options: how many copies the Data cache keeps. */
  readonly options?: { readonly cacheSize?: number };
}

type AnyLoader = (
  params: never,
  request: Request,
) => Effect.Effect<unknown, LoadError, any>;

type ServicesOf<L> = {
  [K in keyof L & string]-?: L[K] extends (
    ...args: never
  ) => Effect.Effect<any, any, infer R>
    ? R
    : never;
}[keyof L & string];

/**
 * A `Loading` that runs the Loaders in place, as `router.loaders` types them:
 * for tests, stories, a server, and an app with no server. A dynamic or
 * client place's Loader is handed `request()`, a plain GET of
 * `http://memory/` by default.
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
      const each = (places: ReadonlyArray<Wanted>) =>
        Stream.fromIterable(places).pipe(
          Stream.mapEffect(
            (place) => {
              const loader = loaders[place.name] as AnyLoader | undefined;
              const run = Effect.suspend(() =>
                !loader
                  ? Effect.die(
                      new Error(
                        `[@kestack/kabuki/routing] no Loader for ${place.name}`,
                      ),
                    )
                  : modes.get(place.name)?.render === 'static'
                    ? (loader as (params: unknown) => ReturnType<AnyLoader>)(
                        place.params,
                      )
                    : loader(place.params as never, request()),
              );
              return Effect.gen(function* () {
                const began = yield* Clock.currentTimeMillis;
                const outcome = yield* outcomeOf(
                  run as Effect.Effect<unknown, LoadError, unknown>,
                );
                const took = (yield* Clock.currentTimeMillis) - began;
                return [place.name, { ...outcome, took } as Answer] as const;
              });
            },
            { concurrency: 'unbounded', unordered: true },
          ),
          Stream.provideContext(services as Context.Context<unknown>),
        ) as Stream.Stream<readonly [string, Answer]>;
      return {
        each,
        load: (places) =>
          Stream.runCollect(each(places)).pipe(
            Effect.map((answers) => Object.fromEntries(answers)),
          ),
      };
    }),
  );
