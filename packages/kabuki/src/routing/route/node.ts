import type { Schema } from 'effect';
import type { LoadersOf, RenderMode } from './loader.ts';
import type { Metadata } from './metadata.ts';

/*
 * A node of the Routes and everything the types work out from a tree of
 * them: each level's values, every Route, every place with its params,
 * data and Render Mode, and the names Loaders are written under. A page
 * made with `Route.page` is a node; its `pages` are the nodes under it.
 */

export type Fields = Schema.Struct.Fields;
/** A Schema read and written without Capabilities and at once. */
export type Codec<T> = Schema.Codec<T, unknown, never, never>;

/**
 * What a node's Metadata is worked out from: its own params and query, and
 * its data once it is there.
 */
export type MetadataOf<P extends Fields, Q extends Fields, D> =
  | Metadata
  | ((
      values: Schema.Struct.Type<P & Q>,
      data: [D] extends [never] ? undefined : D | undefined,
    ) => Metadata);

/**
 * One node: a path template, its params and query, the data its Loader
 * gives and its Render Mode, its Metadata, and the nodes under it. `I` is
 * `never` for a node with no data, `M` `undefined` for one that draws as
 * its parent.
 */
export interface Node<
  P extends Fields = {},
  Q extends Fields = {},
  C extends object = {},
  I = never,
  M extends RenderMode | undefined = undefined,
> {
  readonly path: string;
  readonly params: P;
  readonly query: Q;
  /** The Schema of the data its Loader gives. */
  readonly input: Codec<I> | undefined;
  readonly render: M;
  /** Typed where it is written, in `Route.page`'s options. */
  readonly metadata:
    | Metadata
    | ((values: any, data: any) => Metadata)
    | undefined;
  readonly children: C;
}

export type AnyNode = Node<any, any, any, any, any>;
export type Children = { readonly [tag: string]: AnyNode };

export type Simplify<T> = { [K in keyof T]: T[K] } & {};
type IsEmpty<C> = [keyof C] extends [never] ? true : false;

type OwnOf<N> =
  N extends Node<infer P, infer Q, any, any, any>
    ? Schema.Struct.Type<P & Q>
    : never;
type ParamsOf<N> =
  N extends Node<infer P, any, any, any, any> ? Schema.Struct.Type<P> : never;
type QueryOf<N> =
  N extends Node<any, infer Q, any, any, any> ? Schema.Struct.Type<Q> : never;
export type ChildrenOf<N> =
  N extends Node<any, any, infer C, any, any> ? C : never;
export type DataOf<N> = N extends Node<any, any, any, infer I, any> ? I : never;
/** A node's Render Mode: its own, else its parent's. */
type ModeOf<N, Parent extends RenderMode> =
  N extends Node<any, any, any, any, infer M>
    ? [M] extends [RenderMode]
      ? M
      : Parent
    : Parent;

/** The value of one node under its tag: `page` is the level below, if the URL goes there. */
export type ValueOf<T extends string, N> = Simplify<
  { readonly _tag: T } & OwnOf<N> &
    (IsEmpty<ChildrenOf<N>> extends true
      ? {}
      : { readonly page?: LevelOf<ChildrenOf<N>> })
>;

/** Every value one level can hold: one case per child. */
export type LevelOf<C> = {
  [K in keyof C & string]: ValueOf<K, C[K]>;
}[keyof C & string];

/** The Route of a URL that names no place. */
export type NotFound = { readonly _tag: 'NotFound'; readonly path: string };

/** Every Route of an app. */
export type RouteOf<C> = LevelOf<C> | NotFound;

/** Data of the places of a Route, by dotted name. */
export type PlaceData = { readonly [name: string]: unknown };

type Ctor<Args, R> = {} extends Args ? (args?: Args) => R : (args: Args) => R;

/**
 * What one node is in the tree a user holds: a function that makes its
 * Route from its own and its ancestors' params and query, with its children's
 * under it. Each has its data's Schema, if it has data, and where it sits.
 */
export type NodeApi<N, R, Args> = Ctor<Args, R> & {
  /** Where this node sits: the tags from the root. */
  readonly at: ReadonlyArray<string>;
} & ([DataOf<N>] extends [never]
    ? {}
    : {
        /** The Schema of this place's data: what its Loader answers. */
        readonly data: Codec<DataOf<N>>;
      }) &
  Tree<ChildrenOf<N>, R, Args>;

/** A NodeApi per node, nested as written. Each constructor takes its own and its ancestors' params and query. */
export type Tree<C, R, Inherited> = {
  readonly [K in keyof C & string]: NodeApi<
    C[K],
    R,
    Simplify<Inherited & OwnOf<C[K]>>
  >;
};

/**
 * Every place of a tree, as the types know it. A Loader is handed `params`:
 * every path param down to it, and its own query.
 */
export type PlacesOf<
  C,
  Pre extends string = '',
  Ps = {},
  Mode extends RenderMode = 'static',
> = [keyof C] extends [never]
  ? never
  : {
      [K in keyof C & string]:
        | {
            readonly name: `${Pre}${K}`;
            readonly params: Simplify<Ps & ParamsOf<C[K]> & QueryOf<C[K]>>;
            readonly input: DataOf<C[K]>;
            readonly mode: ModeOf<C[K], Mode>;
          }
        | PlacesOf<
            ChildrenOf<C[K]>,
            `${Pre}${K}.`,
            Ps & ParamsOf<C[K]>,
            ModeOf<C[K], Mode>
          >;
    }[keyof C & string];

/** The dotted name of every place of a tree with data: each needs a Loader. */
export type LoaderNames<C> =
  LoadersOf<PlacesOf<C>> extends infer L ? keyof L & string : never;

/** The dotted name of every static place with data among `X`. */
type StaticIn<X> = X extends {
  readonly name: infer N extends string;
  readonly input: infer I;
  readonly mode: 'static';
}
  ? [I] extends [never]
    ? never
    : N
  : never;

/** The dotted name of every static place of a tree with data. */
export type StaticNames<C> = StaticIn<PlacesOf<C>>;

/** The dotted name of every place of a tree. */
export type NameOf<C> =
  PlacesOf<C> extends { readonly name: infer N extends string } ? N : string;

/** The names of the params a redirect's path template holds: `/posts/:slug` → `slug`. */
type ParamsIn<T extends string> =
  T extends `${string}:${infer Name}/${infer Rest}`
    ? Name | ParamsIn<`/${Rest}`>
    : T extends `${string}:${infer Name}`
      ? Name
      : never;

/** Paths that are never a place, each with the Route that replaces it, from the params its template names. */
export type Redirects<C, D> = {
  readonly [K in keyof D & string]: (
    routes: Tree<C, RouteOf<C>, {}>,
    params: { readonly [P in ParamsIn<K>]: string },
  ) => RouteOf<C>;
};

/** What reading a URL gives: the Route it names, or the Route it is replaced by. */
export type Read<R> =
  | { readonly _tag: 'At'; readonly route: R }
  | { readonly _tag: 'Redirect'; readonly route: R };

/**
 * One place on a Route's path: its dotted name, its key, what its Loader is
 * handed, its Render Mode and its data's Schema.
 */
export interface Place<Name extends string = string> {
  readonly name: Name;
  /** Its name and every path param down to it: a place whose key is the same is the same Instance. */
  readonly key: string;
  /** What its Loader is handed: every path param down to it, and its own query. */
  readonly params: Readonly<Record<string, unknown>>;
  readonly render: RenderMode;
  readonly input: Codec<unknown> | undefined;
}

/** One place of the tree, as Schemas: what a Loader RPC is made from. */
export interface PlaceSchema<Name extends string = string> {
  readonly name: Name;
  /** What its Loader is handed: every path param down to it, its own and its ancestors', and its own query. */
  readonly params: Codec<Record<string, unknown>>;
  readonly render: RenderMode;
  readonly input: Codec<unknown> | undefined;
}

/** How the app got to where it is. */
export type How = 'load' | 'push' | 'replace' | 'back' | 'forward';

/** A value of one level, as the runtime reads it: its tag and its fields. */
export type Value = {
  readonly _tag: string;
  readonly [field: string]: unknown;
};

export const segments = (template: string) =>
  template.split('/').filter(Boolean);
export const hasChildren = (node: AnyNode) =>
  Object.keys(node.children).length > 0;
export const dotted = (at: ReadonlyArray<string>) => at.join('.');
