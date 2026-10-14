import { Context } from 'effect';
import type { Effect, Layer } from 'effect';
import type { LoadError, StaticOf } from '../../routing/route/index.ts';
import { branded, refused } from '../common/index.ts';

/*
 * What `src/loaders.server` hands Start: the Loaders, with what they
 * Require on the server in three tiers, each given its own call:
 *
 *     Start.layers<WorkerEnv>()
 *       .instance((env) => …)              made once                 every Loader
 *       .request((env) => …)               made for each request     every Loader
 *       .visitor(({ env, request }) => …)  made for each request,    dynamic and client
 *                                          from the request itself   Loaders only
 *       .loaders(loaders)
 *
 * Each tier may use the tiers before it, and is checked against them as it
 * is given; the Loaders are checked last, against every tier. A static
 * place's answer is kept for everyone, so its Loader may use nothing made
 * from the request: Requiring a visitor service is a type error, and on a
 * page whose places are all static the visitor Layer is never made.
 *
 * Each tier is its own call so that its function is typed as written: a
 * check over every tier at once, in one call, would settle their types
 * before their functions are read.
 */

/** One place's Loader, as `Routes.loaders` types it. */
export type AnyLoader = (
  params: never,
  request: Request,
) => Effect.Effect<unknown, LoadError, any>;

type AnyLoaders = Readonly<Record<string, AnyLoader>>;

/**
 * Headers for the response to the request being answered, as a refreshed
 * session's `set-cookie`: for the visitor Layer and the dynamic and client
 * Loaders, never a static one, whose page is kept for everyone.
 */
export class ResponseHeaders extends Context.Service<
  ResponseHeaders,
  { readonly append: (name: string, value: string) => Effect.Effect<void> }
>()('@kestack/kabuki/start/ResponseHeaders') {}

/** The tiers as Start makes them: each a function of what it is made from. */
export interface Tiers {
  /** Made once, the first time it is needed, and kept: clients of bindings, config, caches. */
  readonly instance?: (env: any) => Layer.Layer<any, unknown, never>;
  /** Made for each request that loads, from the env alone: what must not outlive a request, like a database connection. */
  readonly request?: (env: any) => Layer.Layer<any, unknown, never>;
  /** Made for each request that loads a dynamic or client place, from the env and the request itself: who is signed in. */
  readonly visitor?: (from: {
    readonly env: any;
    readonly request: Request;
  }) => Layer.Layer<any, unknown, never>;
}

const LOADERS = Symbol.for('@kestack/kabuki/start/loaders');

/** The Loaders and what they Require: what `src/loaders.server` default-exports. */
export interface StartLoaders<L = AnyLoaders> {
  readonly [LOADERS]: true;
  readonly loaders: L;
  readonly tiers: Tiers;
}

/** What the Loaders of `L` named `K` Require. */
type ServicesOf<L, K extends keyof L> = {
  [P in K]-?: L[P] extends (...args: never) => Effect.Effect<any, any, infer R>
    ? R
    : never;
}[K];

type Names<L> = keyof L & string;
/** What the static places' Loaders Require. */
type StaticNeeds<L> = ServicesOf<L, StaticOf<L> & Names<L>>;
/** What the dynamic and client places' Loaders Require. */
type LaterNeeds<L> = ServicesOf<L, Exclude<Names<L>, StaticOf<L>>>;

/** What is missing, named, if anything is. */
type Missing<Need, Given, Says extends string> = [
  Exclude<Need, Given>,
] extends [never]
  ? unknown
  : { readonly [K in Says]: Exclude<Need, Given> };

/**
 * The Loaders, checked against the tiers: each Requirement no tier they
 * may use gives is a property they miss, named by what Requires it.
 */
type Covered<L, I, R, V> = Missing<
  StaticNeeds<L>,
  I | R,
  'static Loaders Require what no instance or request Layer gives'
> &
  Missing<
    LaterNeeds<L>,
    I | R | V | ResponseHeaders,
    'dynamic and client Loaders Require what no Layer gives'
  >;

/**
 * The tiers given so far, with what each gives: `I`, `R` and `V`. Each
 * tier is checked as it is given against those before it; the Loaders,
 * last, against all of them.
 */
export interface LayersOf<Env, I, R, V> {
  /** Made once, from the env, the first time it is needed, and kept for every request: it Requires nothing. */
  readonly instance: <Given>(
    make: (env: Env) => Layer.Layer<Given, unknown, never>,
  ) => LayersOf<Env, Given, R, V>;
  /** Made for each request that loads, from the env: it may Require what the instance tier gives. */
  readonly request: <Given>(
    make: (env: Env) => Layer.Layer<Given, unknown, I>,
  ) => LayersOf<Env, I, Given, V>;
  /**
   * Made for each request that loads a dynamic or client place, from the
   * env and the request: it may Require what the instance and request
   * tiers give, and `ResponseHeaders`.
   */
  readonly visitor: <Given>(
    make: (from: {
      readonly env: Env;
      readonly request: Request;
    }) => Layer.Layer<Given, unknown, I | R | ResponseHeaders>,
  ) => LayersOf<Env, I, R, Given>;
  /** The Loaders, checked against every tier: what `src/loaders.server` default-exports. */
  readonly loaders: <const L extends AnyLoaders>(
    loaders: L & Covered<L, I, R, V>,
  ) => StartLoaders<L>;
}

const layersOf = <Env, I, R, V>(tiers: Tiers): LayersOf<Env, I, R, V> => ({
  instance: (make) => layersOf({ ...tiers, instance: make }),
  request: (make) =>
    layersOf({ ...tiers, request: make as NonNullable<Tiers['request']> }),
  visitor: (make) =>
    layersOf({ ...tiers, visitor: make as NonNullable<Tiers['visitor']> }),
  loaders: (loaders) => ({ [LOADERS]: true, loaders, tiers }),
});

/**
 * The Loaders' Layers, a tier at a time, the env typed as the platform
 * gives it: `Start.layers<WorkerEnv>().instance(…).request(…).visitor(…)
 * .loaders(loaders)`. Every tier is optional; `.loaders` ends it.
 */
export const layers = <Env = unknown>(): LayersOf<Env, never, never, never> =>
  layersOf({});

/** What `src/loaders.server` default-exports, if there is one: `Start.layers()…loaders(…)`, and nothing else, so it is checked. */
export const loadersOf = (exported: unknown): StartLoaders => {
  if (exported === undefined)
    return { [LOADERS]: true, loaders: {}, tiers: {} };
  if (branded(exported, LOADERS)) return exported as StartLoaders;
  throw refused(
    'src/loaders.server',
    'Start.layers().loaders(Routes.loaders({ … }))',
  );
};

/**
 * Start, as `src/loaders.server` writes it: `Start.layers()`, the Loaders
 * with what they Require on the server, in three tiers, a call each; and
 * `Start.ResponseHeaders`, what a dynamic or client Loader adds headers to
 * its response with.
 */
export const Start = { layers, ResponseHeaders };
