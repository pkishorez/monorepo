import { Context, Effect, Layer } from 'effect';
import type { LoadError, StaticOf } from '../../routing/route/index.ts';
import { branded, refused } from '../common/index.ts';

/*
 * What `src/loaders.server` hands Start: the Loaders, and what they Require
 * on the server, as two Layers. Loaders that Require nothing are given
 * alone, `Start.server(loaders)`; otherwise the Layers come first:
 *
 *     Start.server({
 *       layer,       made once, the first time a Loader needs it   every Loader
 *       visitor,     made for each request, from the request        dynamic and client
 *     })                                                            Loaders only
 *       .loaders(loaders)                router.loaders({ … })
 *
 * Both may read the platform's env as `Start.Env`; the visitor may read
 * `Start.Request` and `Start.ResponseHeaders` too, and what the layer
 * gives. A static place's answer is kept for everyone, so its Loader may
 * use nothing made from the request: Requiring what only the visitor gives
 * is a type error, and on a page whose places are all static the visitor is
 * never made.
 *
 * The Loaders are their own call so that the Layers are typed as written:
 * a Layer written in place, as `Layer.succeed(…)`, is typed by what it is
 * checked against when the check is in the same call. Every check is made
 * at `.loaders(…)`, once both Layers are known.
 */

/** One place's Loader, as `Routes.loaders` types it. */
export type AnyLoader = (
  params: never,
  request: globalThis.Request,
) => Effect.Effect<unknown, LoadError, any>;

type AnyLoaders = Readonly<Record<string, AnyLoader>>;

/**
 * The platform's env, as its adapter hands it with each request: a
 * Worker's bindings, or the process's. Read it typed with
 * `Start.env<WorkerEnv>()`.
 */
export class Env extends Context.Service<Env, unknown>()(
  '@kestack/kabuki/start/Env',
) {}

/** The request being answered: for the visitor and the dynamic and client Loaders, never a static one. */
export class Request extends Context.Service<Request, globalThis.Request>()(
  '@kestack/kabuki/start/Request',
) {}

/**
 * Headers for the response to the request being answered, as a refreshed
 * session's `set-cookie`: for the visitor and the dynamic and client
 * Loaders, never a static one, whose page is kept for everyone.
 */
export class ResponseHeaders extends Context.Service<
  ResponseHeaders,
  { readonly append: (name: string, value: string) => Effect.Effect<void> }
>()('@kestack/kabuki/start/ResponseHeaders') {}

/** The platform's env, typed as the app says it is: `yield* Start.env<WorkerEnv>()`. */
export const env = <E>(): Effect.Effect<E, never, Env> =>
  Env.use((given) => Effect.succeed(given as E));

/** What only a request Start answers gives: never for a static Loader. */
type FromRequest = Request | ResponseHeaders;

/** The two Layers as Start makes them. */
export interface Layers {
  readonly layer?: Layer.Layer<any, unknown, Env>;
  readonly visitor?: Layer.Layer<any, unknown, any>;
}

const SERVER = Symbol.for('@kestack/kabuki/start/server');

/** The Loaders and what they Require: what `src/loaders.server` default-exports. */
export interface StartServer<L = AnyLoaders> {
  readonly [SERVER]: true;
  readonly loaders: L;
  readonly layers: Layers;
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
 * The Loaders, checked against the Layers, and the visitor against the
 * layer: each Requirement nothing it may use gives is a property they
 * miss, named by what Requires it.
 */
type Covered<L, A, V, RV> = Missing<
  StaticNeeds<L>,
  A | Env,
  'static Loaders Require what the layer does not give'
> &
  Missing<
    LaterNeeds<L>,
    A | V | Env | FromRequest,
    'dynamic and client Loaders Require what neither the layer nor the visitor gives'
  > &
  Missing<
    RV,
    A | Env | FromRequest,
    'the visitor Requires what the layer does not give'
  >;

/** What `Start.server` takes: the two Layers, each optional. */
export interface ServerLayers<A, RA, V, RV> {
  /** Made once, the first time a Loader needs it, and kept for every request: clients of bindings, config, caches. It may read `Start.Env`. */
  readonly layer?: Layer.Layer<A, unknown, RA> &
    Missing<RA, Env, 'the layer is made once: it may Require only Start.Env'>;
  /**
   * Made for each request that loads a dynamic or client place: who is
   * signed in. It may read what the layer gives, `Start.Env`,
   * `Start.Request` and `Start.ResponseHeaders`.
   */
  readonly visitor?: Layer.Layer<V, unknown, RV>;
}

/** The Layers given, waiting for the Loaders they are for. */
export interface ServerOf<A, V, RV> {
  /** The Loaders, checked against both Layers: what `src/loaders.server` default-exports. */
  readonly loaders: <const L extends AnyLoaders>(
    loaders: L & Covered<L, A, V, RV>,
  ) => StartServer<L>;
}

/** The Loaders and the Layers they run with: what `src/loaders.server` default-exports. */
const served = <L>(loaders: L, layers: Layers): StartServer<L> => ({
  [SERVER]: true,
  loaders,
  layers: {
    ...(layers.layer !== undefined && { layer: layers.layer }),
    ...(layers.visitor !== undefined && { visitor: layers.visitor }),
  },
});

/** Whether Start was handed Layers, `{ layer, visitor }`, rather than Loaders. */
const isLayers = (given: object): given is Layers =>
  Object.keys(given).length > 0 &&
  Object.entries(given).every(
    ([key, value]) =>
      (key === 'layer' || key === 'visitor') && Layer.isLayer(value),
  );

/**
 * What `src/loaders.server` default-exports. Loaders that Require nothing
 * are given alone: `Start.server(loaders)`, a type error if any of them
 * Requires something. Otherwise what they Require comes first, as two
 * Layers, both optional, then the Loaders, checked against both:
 * `Start.server({ layer, visitor }).loaders(loaders)`.
 */
export function server<const L extends AnyLoaders>(
  loaders: L & Covered<L, never, never, never>,
): StartServer<L>;
export function server<A = never, RA = never, V = never, RV = never>(
  layers?: ServerLayers<A, RA, V, RV>,
): ServerOf<A, V, RV>;
export function server(
  given?: object,
): StartServer<AnyLoaders> | ServerOf<unknown, unknown, unknown> {
  // Nothing, or `undefined`, is no Layers: the Loaders come after.
  if (given !== undefined && !isLayers(given))
    return served(given as AnyLoaders, {});
  const layers = (given ?? {}) as Layers;
  return { loaders: (loaders) => served(loaders, layers) };
}

/** What `src/loaders.server` default-exports, if there is one: `Start.server(…)`, and nothing else, so it is checked. */
export const serverOf = (exported: unknown): StartServer => {
  if (exported === undefined)
    return { [SERVER]: true, loaders: {}, layers: {} };
  if (branded(exported, SERVER)) return exported as StartServer;
  throw refused(
    'src/loaders.server',
    'Start.server(loaders), or Start.server({ layer, visitor }).loaders(loaders)',
  );
};

/**
 * Start, as `src/loaders.server` writes it: `Start.server(loaders)`, or
 * `Start.server({ layer, visitor }).loaders(loaders)`, the Loaders with
 * what they Require on the server; `Start.env()`, the platform's env, typed; and the services Start
 * gives what is made for a request: `Start.Env`, `Start.Request` and
 * `Start.ResponseHeaders`.
 */
export const Start = { server, env, Env, Request, ResponseHeaders };
