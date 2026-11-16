import { Schema } from 'effect';
import type { Effect } from 'effect';

/*
 * What a Loader may fail with, and the typing of every Loader of an app.
 * No server code: the Routes say which places have data and how each is
 * drawn, so the Loaders' types are worked out from them, and Start runs them.
 */

/** Where and when a place is first drawn: static, dynamic or client, each later than the one before. */
export type RenderMode = 'static' | 'dynamic' | 'client';

/**
 * The Render Mode a page may say: later than the page above it, never
 * earlier. Static is where every app starts, so no page says it.
 */
export type SaidMode = 'dynamic' | 'client';

export const MODES: ReadonlyArray<RenderMode> = ['static', 'dynamic', 'client'];

/** A Loader's answer: the place it was asked for is not found. */
export class NotFoundError extends Schema.TaggedError<NotFoundError>()(
  'NotFound',
  {},
) {}

/**
 * A Loader's answer: go elsewhere instead, to a Route of the app or, with
 * `href`, to a URL outside it. Plain data, so it travels as it is; a Routes
 * tree can check the Route with its `route` Schema. `permanent` is a `308`
 * on the server rather than a `302`.
 */
export class RedirectError extends Schema.TaggedError<RedirectError>()(
  'Redirect',
  {
    route: Schema.optionalKey(Schema.Unknown),
    href: Schema.optionalKey(Schema.String),
    permanent: Schema.optionalKey(Schema.Boolean),
  },
) {}

/** A Redirect to a Route of type `R`, or out of the app: what a Loader of an app whose Routes are `R` may fail with. */
export type RedirectTo<R = any> = RedirectError & { readonly route?: R };

/** How a Loader fails: the place is not found, or the app goes elsewhere. */
export type LoadError<R = unknown> = NotFoundError | RedirectTo<R>;

/** Where a Redirect goes: a Route of the app, or a URL outside it. */
export type Target =
  | { readonly route: unknown; readonly href?: undefined }
  | { readonly href: string; readonly route?: undefined };

/**
 * What loading one place came to: its data, or why there is none: its
 * Loader said not found or Redirected, or something broke on the way.
 */
export type Outcome =
  | { readonly _tag: 'Loaded'; readonly data: unknown }
  | { readonly _tag: 'NotFound' }
  | ({ readonly _tag: 'Redirect'; readonly permanent?: boolean } & Target)
  | { readonly _tag: 'Broken'; readonly reason: string };

/** What the types know of one place: its dotted name, what its Loader is handed, its data, its Render Mode, and whether it names path params of its own. */
export interface PlaceType {
  readonly name: string;
  /** Every path param down to it, and its own query unless it is static: a static place is the same whatever the query. */
  readonly params: object;
  readonly input: unknown;
  readonly mode: RenderMode;
  /** Whether its own path names params: a static place that does lists every one of its paths. */
  readonly lists: boolean;
}

/** How a place loads its data: a static place's is given its path params; a dynamic or client place's, its query and the request too. */
export type LoadOf<
  X extends PlaceType,
  R = unknown,
> = X['mode'] extends 'static'
  ? (params: X['params']) => Effect.Effect<X['input'], LoadError<R>, any>
  : (
      params: X['params'],
      request: Request,
    ) => Effect.Effect<X['input'], LoadError<R>, any>;

/** Every path a static place is drawn at: the path params of each, its own and those above it. A path not listed is not found. */
export type PathsOf<X extends PlaceType> = () => Effect.Effect<
  ReadonlyArray<X['params']>,
  unknown,
  any
>;

/**
 * A place's Loader, with the options of its Render Mode. It is the function
 * that loads its data, or `{ load }`; a static place whose path names
 * params is `{ paths, load }`, since only a listed path can be drawn before
 * anyone asks, and `{ paths }` alone if it has no data.
 */
export type LoaderOf<
  X extends PlaceType,
  R = unknown,
> = X['mode'] extends 'static'
  ? X['lists'] extends true
    ? [X['input']] extends [never]
      ? { readonly paths: PathsOf<X> }
      : { readonly paths: PathsOf<X>; readonly load: LoadOf<X, R> }
    : LoadOf<X, R> | { readonly load: LoadOf<X, R> }
  : LoadOf<X, R> | { readonly load: LoadOf<X, R> };

/** Whether a place is written among the Loaders: it has data, or it is static and lists its paths. */
type Written<X extends PlaceType> = [X['input']] extends [never]
  ? X['mode'] extends 'static'
    ? X['lists']
    : false
  : true;

/** One Loader per place with data, or with paths to list, by its dotted name, each Redirecting only to a Route of type `R`. */
export type LoadersOf<X extends PlaceType, R = unknown> = {
  readonly [P in X as Written<P> extends true ? P['name'] : never]: LoaderOf<
    P,
    R
  >;
};

/** What loading a place's data Requires, from its Loader as written. */
export type RequiredToLoad<E> =
  | (E extends (...args: never) => Effect.Effect<any, any, infer R> ? R : never)
  | (E extends {
      readonly load: (...args: never) => Effect.Effect<any, any, infer R>;
    }
      ? R
      : never);

/** What one Loader, as written, Requires: its `load`'s and its `paths`' alike. */
export type RequiredBy<E> =
  | RequiredToLoad<E>
  | (E extends {
      readonly paths: (...args: never) => Effect.Effect<any, any, infer R>;
    }
      ? R
      : never);

/** Any place's `load`, as the code that runs it sees it. */
export type AnyLoad = (
  params: never,
  request: Request,
) => Effect.Effect<unknown, LoadError, any>;

/** Any place's `paths`, as the code that runs it sees it. */
export type AnyPaths = () => Effect.Effect<
  ReadonlyArray<Readonly<Record<string, unknown>>>,
  unknown,
  any
>;

/** Any place's Loader, as written. */
export type AnyLoader =
  | AnyLoad
  | { readonly load?: AnyLoad; readonly paths?: AnyPaths };

/** The function that loads a place's data, from its Loader as written; none for a place that only lists its paths. */
export const loadOf = (loader: AnyLoader | undefined): AnyLoad | undefined =>
  typeof loader === 'function' ? loader : loader?.load;

/** The function that lists a static place's paths, from its Loader as written. */
export const pathsOf = (loader: AnyLoader | undefined): AnyPaths | undefined =>
  typeof loader === 'function' ? undefined : loader?.paths;

declare const STATIC: unique symbol;

/**
 * Loaders as `router.loaders` gives them: the record, and, by type alone,
 * the names of the static places among them. A server hands those nothing
 * made from the request, since what they answer is the same for everyone.
 */
export type Loaders<L, Static extends string> = L & {
  // The names sit in an object, so that none static, `never`, still says so.
  readonly [STATIC]?: { readonly names: Static };
};

/**
 * The names of the static places among Loaders. Loaders `router.loaders`
 * did not give say nothing, so every one of them counts as static.
 */
export type StaticOf<L> = L extends {
  readonly [STATIC]?: { readonly names: infer S extends string };
}
  ? S
  : keyof L & string;

/**
 * A record of Loaders with exactly the `Wanted` names: a name too many, and
 * the names missing, each say so in the error, by name.
 */
export type Exactly<L, Wanted extends PropertyKey> = L & {
  readonly [K in Exclude<keyof L & string, Wanted>]: {
    readonly 'is not a place with data, nor a static one with paths to list': K;
  };
} & ([Exclude<Wanted, keyof L>] extends [never]
    ? unknown
    : {
        readonly 'these places have data, or paths to list, and no Loader': Exclude<
          Wanted,
          keyof L
        >;
      });
