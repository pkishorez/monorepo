import { Schema } from 'effect';
import type { LoadersOf, RenderMode } from './loader.ts';
import type { Metadata } from './metadata.ts';
import type { OutletOf } from './outlet.ts';

/*
 * A node of the Routes and everything the types work out from a tree of
 * them: each level's values, every Route, every place with its params,
 * Input and Render Mode, the Props each node's Actor is handed, and the
 * names Loaders are written under. `Route.path` makes one node.
 */

export type Fields = Schema.Struct.Fields;
/** A Schema read and written without Capabilities and at once. */
export type Codec<T> = Schema.Codec<T, unknown, never, never>;

/** What a node's Metadata is worked out from: its own params and query, and its Input. */
export type MetadataOf<P extends Fields, Q extends Fields, I> =
  | Metadata
  | ((values: Schema.Struct.Type<P & Q>, input: I) => Metadata);

/**
 * One node: a path template, its params and query, the Input it needs and
 * its Render Mode, its Metadata, and the nodes under it. `I` is `never` for
 * a node with no Input, `M` `undefined` for one that draws as its parent.
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
  readonly input: Codec<I> | undefined;
  readonly render: M;
  /** Typed where it is written, in `Route.path`'s options. */
  readonly metadata:
    | Metadata
    | ((values: any, input: any) => Metadata)
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
type ChildrenOf<N> = N extends Node<any, any, infer C, any, any> ? C : never;
type InputOf<N> = N extends Node<any, any, any, infer I, any> ? I : never;
/** A node's Render Mode: its own, else its parent's. */
type ModeOf<N, Parent extends RenderMode> =
  N extends Node<any, any, any, any, infer M>
    ? [M] extends [RenderMode]
      ? M
      : Parent
    : Parent;

/** The value of one node under its tag. */
export type ValueOf<T extends string, N> = Simplify<
  { readonly _tag: T } & OwnOf<N> &
    (IsEmpty<ChildrenOf<N>> extends true
      ? {}
      : { readonly page: LevelOf<ChildrenOf<N>> })
>;

/** Every value one level can hold: one case per child. */
export type LevelOf<C> = {
  [K in keyof C & string]: ValueOf<K, C[K]>;
}[keyof C & string];

/** The Route of a URL that names no place. */
export type NotFound = { readonly _tag: 'NotFound'; readonly path: string };

/** Every Route of an app. */
export type RouteOf<C> = LevelOf<C> | NotFound;

/** The Inputs of the places of a Route, by dotted name. Each is there once loaded. */
export type Inputs = { readonly [name: string]: unknown };

/** What a node's Actor is handed as Props: its value without the tag, and the Inputs below it. */
export type PropsOf<N> = Simplify<
  OwnOf<N> &
    (IsEmpty<ChildrenOf<N>> extends true
      ? {}
      : {
          readonly page: LevelOf<ChildrenOf<N>>;
          readonly inputs?: Inputs;
        })
>;

/** The root's Props: the whole Route, under `page`, and the Inputs of its places. */
export type RootProps<C> = {
  readonly page: RouteOf<C>;
  readonly inputs?: Inputs;
};

type Ctor<Args, R> = {} extends Args ? (args?: Args) => R : (args: Args) => R;

/**
 * What one node is in the tree a user holds: its Props' Schema, its Input's
 * if it has one, and where it sits; a place to call when it has no children,
 * else its children and its outlet.
 */
export type NodeApi<N, R, Args> = {
  /** The Schema of what this node's Actor is handed as Props. */
  readonly props: Codec<PropsOf<N>>;
  /** Where this node sits: the tags from the root. */
  readonly at: ReadonlyArray<string>;
} & ([InputOf<N>] extends [never]
  ? {}
  : {
      /** The Schema of this place's Input: what its Loader answers and its Actor starts from. */
      readonly input: Codec<InputOf<N>>;
    }) &
  (IsEmpty<ChildrenOf<N>> extends true
    ? Ctor<Args, R>
    : Tree<ChildrenOf<N>, R, Args> & {
        /** Which Actor, or drawing, serves each child Route. */
        readonly outlet: OutletOf<ChildrenOf<N>, PropsOf<N>>;
      });

/** A NodeApi per node, nested as written. Each constructor takes its own and its ancestors' params and query. */
export type Tree<C, R, Inherited> = {
  readonly [K in keyof C & string]: NodeApi<
    C[K],
    R,
    Simplify<Inherited & OwnOf<C[K]>>
  >;
};

/** Every place of a tree, as the types know it. */
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
            readonly params: Simplify<Ps & ParamsOf<C[K]>>;
            readonly input: InputOf<C[K]>;
            readonly mode: ModeOf<C[K], Mode>;
          }
        | PlacesOf<
            ChildrenOf<C[K]>,
            `${Pre}${K}.`,
            Ps & ParamsOf<C[K]>,
            ModeOf<C[K], Mode>
          >;
    }[keyof C & string];

/** The dotted name of every place of a tree with an Input: each needs a Loader. */
export type LoaderNames<C> =
  LoadersOf<PlacesOf<C>> extends infer L ? keyof L & string : never;

/** The dotted name of every static place with an Input among `X`. */
type StaticIn<X> = X extends {
  readonly name: infer N extends string;
  readonly input: infer I;
  readonly mode: 'static';
}
  ? [I] extends [never]
    ? never
    : N
  : never;

/** The dotted name of every static place of a tree with an Input. */
export type StaticNames<C> = StaticIn<PlacesOf<C>>;

/** The dotted name of every place of a tree. */
export type NameOf<C> =
  PlacesOf<C> extends { readonly name: infer N extends string } ? N : string;

type Earlier<M, Parent> = M extends 'static'
  ? Parent extends 'static'
    ? false
    : true
  : M extends 'dynamic'
    ? Parent extends 'client'
      ? true
      : false
    : false;

/** The dotted names of the places drawn earlier than the place that holds them. */
export type Misdrawn<
  C,
  Pre extends string = '',
  Mode extends RenderMode = 'static',
> = [keyof C] extends [never]
  ? never
  : {
      [K in keyof C & string]:
        | (C[K] extends Node<any, any, any, any, infer M>
            ? [M] extends [RenderMode]
              ? Earlier<M, Mode> extends true
                ? `${Pre}${K}`
                : never
              : never
            : never)
        | Misdrawn<ChildrenOf<C[K]>, `${Pre}${K}.`, ModeOf<C[K], Mode>>;
    }[keyof C & string];

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

/** One place on a Route's path: its dotted name, every param down to it, its Render Mode and its Input's Schema. */
export interface Place<Name extends string = string> {
  readonly name: Name;
  readonly params: Readonly<Record<string, unknown>>;
  readonly render: RenderMode;
  readonly input: Codec<unknown> | undefined;
}

/** One place of the tree, as Schemas: what a Loader RPC is made from. */
export interface PlaceSchema<Name extends string = string> {
  readonly name: Name;
  /** Every param down to it, its own and its ancestors'. */
  readonly params: Codec<Record<string, unknown>>;
  readonly render: RenderMode;
  readonly input: Codec<unknown> | undefined;
}

/**
 * A place: `Route.path('/projects/:id', { params: { id: Schema.FiniteFromString } })`,
 * with the nodes under it as a third argument. `input` says it needs a
 * Loader; `render` how it is first drawn, its parent's by default;
 * `metadata` what it says about itself, from its params and Input.
 */
export const path = <
  P extends Fields = {},
  Q extends Fields = {},
  C extends object = {},
  I = never,
  M extends RenderMode | undefined = undefined,
>(
  template: string,
  options?: {
    readonly params?: P;
    readonly query?: Q;
    readonly input?: Codec<I>;
    readonly render?: M;
    readonly metadata?: MetadataOf<P, Q, I>;
  },
  children?: C,
): Node<P, Q, C, I, M> => ({
  path: template,
  params: (options?.params ?? {}) as P,
  query: (options?.query ?? {}) as Q,
  input: options?.input,
  render: options?.render as M,
  metadata: options?.metadata,
  children: (children ?? {}) as C,
});

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
