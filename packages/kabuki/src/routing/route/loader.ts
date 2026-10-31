import { Schema } from 'effect';
import type { Effect } from 'effect';

/*
 * What a Loader may fail with, and the typing of every Loader of an app.
 * No server code: the Routes say which places need an Input and how each is
 * drawn, so the Loaders' types are worked out from them, and Start runs them.
 */

/** Where and when a place is first drawn: static, dynamic or client, each later than the one before. */
export type RenderMode = 'static' | 'dynamic' | 'client';

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

/** What the types know of one place: its dotted name, every param down to it, its Input, and its Render Mode. */
export interface PlaceType {
  readonly name: string;
  readonly params: object;
  readonly input: unknown;
  readonly mode: RenderMode;
}

/** A place's Loader: a static place's is given its params and query; a dynamic or client place's, the request too. */
export type LoaderOf<
  X extends PlaceType,
  R = unknown,
> = X['mode'] extends 'static'
  ? (params: X['params']) => Effect.Effect<X['input'], LoadError<R>, any>
  : (
      params: X['params'],
      request: Request,
    ) => Effect.Effect<X['input'], LoadError<R>, any>;

/** One Loader per place with an Input, by its dotted name, each Redirecting only to a Route of type `R`. */
export type LoadersOf<X extends PlaceType, R = unknown> = {
  readonly [
    P in X as [P['input']] extends [never] ? never : P['name']
  ]: LoaderOf<P, R>;
};

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
    readonly 'is not a place with an Input': K;
  };
} & ([Exclude<Wanted, keyof L>] extends [never]
    ? unknown
    : {
        readonly 'these places have an Input and no Loader': Exclude<
          Wanted,
          keyof L
        >;
      });
