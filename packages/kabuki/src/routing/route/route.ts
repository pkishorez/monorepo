import { Schema } from 'effect';
import { MODES } from './loader.ts';
import type { Exactly, LoadersOf, RenderMode } from './loader.ts';
import { merge } from './metadata.ts';
import type { Metadata } from './metadata.ts';
import type { OutletOf } from './outlet.ts';

/*
 * Routes are written once, as a tree of `Route.path` nodes. The same tree is
 * a Schema for every level, a constructor for every place, both directions
 * between a URL and a Route, each place's Input, Render Mode and Metadata,
 * and the type of every Loader. It holds no state and runs nothing.
 *
 * A Route value is one tagged object per level: a node with children holds
 * the one below it under `page`.
 *
 *   Routes.Settings.Billing()  →  { _tag: 'Settings', page: { _tag: 'Billing' } }
 *
 * What a node's Actor is handed as Props is its value without the tag: its
 * params and query, and, if it has children, `page`, and the Inputs of the
 * places below it under `inputs`. The root's Props are `{ page, inputs }`.
 * A place is named by its tags from the root, dotted: `Settings.Billing`.
 */

type Fields = Schema.Struct.Fields;
/** A Schema read and written without Capabilities and at once. */
export type Codec<T> = Schema.Codec<T, unknown, never, never>;

/** What a node's Metadata is worked out from: its own params and query, and its Input. */
type MetadataOf<P extends Fields, Q extends Fields, I> =
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

type Simplify<T> = { [K in keyof T]: T[K] } & {};
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
type LoaderNames<C> =
  LoadersOf<PlacesOf<C>> extends infer L ? keyof L & string : never;

/** The dotted name of every place of a tree. */
type NameOf<C> =
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

// Values --------------------------------------------------------------------------

export type Value = {
  readonly _tag: string;
  readonly [field: string]: unknown;
};

const segments = (template: string) => template.split('/').filter(Boolean);
const hasChildren = (node: AnyNode) => Object.keys(node.children).length > 0;
const dotted = (at: ReadonlyArray<string>) => at.join('.');

/** The Schema of the fields a node's value holds besides its tag. */
const fieldsOf = (node: AnyNode): Fields => ({
  ...node.params,
  ...node.query,
  ...(hasChildren(node) ? { page: levelSchema(node.children, false) } : {}),
});

/** Every place below `at` that has an Input, with its dotted name. */
const inputsBelow = (
  children: Children,
  at: ReadonlyArray<string>,
): ReadonlyArray<readonly [string, Codec<unknown>]> =>
  Object.entries(children).flatMap(([tag, node]) => [
    ...(node.input
      ? [[dotted([...at, tag]), node.input as Codec<unknown>] as const]
      : []),
    ...inputsBelow(node.children, [...at, tag]),
  ]);

/** The Schema of the Inputs of the places below `at`, each there once loaded. */
export const inputsSchema = (
  children: Children,
  at: ReadonlyArray<string>,
): Codec<Inputs> | undefined => {
  const below = inputsBelow(children, at);
  if (below.length === 0) return undefined;
  return Schema.Struct(
    Object.fromEntries(
      below.map(([name, input]) => [name, Schema.optionalKey(input)]),
    ),
  ) as unknown as Codec<Inputs>;
};

/** The Schema of a node's Props: its value's fields, and the Inputs below it if any place there has one. */
const propsFieldsOf = (node: AnyNode, at: ReadonlyArray<string>): Fields => {
  const inputs = inputsSchema(node.children, at);
  return {
    ...fieldsOf(node),
    ...(inputs ? { inputs: Schema.optionalKey(inputs) } : {}),
  };
};

const cache = new WeakMap<object, Codec<unknown>>();
export const levelSchema = (
  children: Children,
  root: boolean,
): Codec<unknown> => {
  if (!root && cache.has(children)) return cache.get(children)!;
  const schema = Schema.TaggedUnion({
    ...Object.fromEntries(
      Object.entries(children).map(([tag, node]) => [tag, fieldsOf(node)]),
    ),
    ...(root ? { NotFound: { path: Schema.String } } : {}),
  }) as unknown as Codec<unknown>;
  if (!root) cache.set(children, schema);
  return schema;
};

/** A node's value without its tag: what its Actor is handed. */
export const propsOf = (value: Value): Record<string, unknown> => {
  const { _tag: _, ...rest } = value;
  return rest;
};

/** The value one level down a path of tags, if the Route goes that way. */
export const valueAt = (
  route: Value | null | undefined,
  at: ReadonlyArray<string>,
): Value | undefined => {
  let value = route ?? undefined;
  for (const tag of at)
    value = value?._tag === tag ? (value.page as Value | undefined) : undefined;
  return value;
};

/** The params of a node's value, as one string: two values with the same params are the same place. */
export const paramsKey = (node: AnyNode, value: Value): string =>
  JSON.stringify(Object.keys(node.params).map((key) => value[key]));

/** The Inputs of the places below `at`: what a node hands down in its Props. */
export const inputsUnder = (
  inputs: Inputs | undefined,
  at: ReadonlyArray<string>,
): Inputs | undefined => {
  if (!inputs) return undefined;
  const prefix = at.length === 0 ? '' : `${dotted(at)}.`;
  const below = Object.entries(inputs).filter(([name]) =>
    name.startsWith(prefix),
  );
  return below.length === 0 ? undefined : Object.fromEntries(below);
};

// Places --------------------------------------------------------------------------

/** The places on a Route's path, from the root down. The not-found Route has none. */
const placesOn = (children: Children, route: Value): ReadonlyArray<Place> => {
  const out: Array<Place> = [];
  let layer = children;
  let value: Value | undefined = route;
  const at: Array<string> = [];
  let params: Record<string, unknown> = {};
  let render: RenderMode = 'static';
  while (value) {
    const node: AnyNode | undefined = layer[value._tag];
    if (!node) break;
    at.push(value._tag);
    const own = value;
    params = {
      ...params,
      ...Object.fromEntries(Object.keys(node.params).map((k) => [k, own[k]])),
    };
    render = (node.render as RenderMode | undefined) ?? render;
    out.push({ name: dotted(at), params, render, input: node.input });
    layer = node.children;
    value = hasChildren(node) ? (value.page as Value | undefined) : undefined;
  }
  return out;
};

/** Every place of the tree, as Schemas, from the root down. */
const allPlaces = (
  children: Children,
  at: ReadonlyArray<string> = [],
  params: Fields = {},
  render: RenderMode = 'static',
): ReadonlyArray<PlaceSchema> =>
  Object.entries(children).flatMap(([tag, node]) => {
    const here = [...at, tag];
    const fields = { ...params, ...node.params };
    const mode = (node.render as RenderMode | undefined) ?? render;
    return [
      {
        name: dotted(here),
        params: Schema.Struct(fields) as unknown as Codec<
          Record<string, unknown>
        >,
        render: mode,
        input: node.input,
      },
      ...allPlaces(node.children, here, fields, mode),
    ];
  });

/** Throws, naming the place, if one is drawn earlier than the place that holds it. */
const checkModes = (
  children: Children,
  at: ReadonlyArray<string> = [],
  parent: RenderMode = 'static',
): void => {
  for (const [tag, node] of Object.entries(children)) {
    const own = node.render as RenderMode | undefined;
    if (own && MODES.indexOf(own) < MODES.indexOf(parent))
      throw new Error(
        `[@kestack/kabuki/routing] ${dotted([...at, tag])} is ${own}, but the place that holds it is ${parent}: a place can only be drawn later than its parent`,
      );
    checkModes(node.children, [...at, tag], own ?? parent);
  }
};

/** A place's key: its name and every param down to it. A place whose key did not change keeps its Input. */
export const placeKey = (place: Place): string =>
  JSON.stringify([place.name, place.params]);

// Reading and writing URLs --------------------------------------------------------

const structOf = (fields: Fields) =>
  Schema.Struct(fields) as unknown as Codec<Record<string, unknown>>;

const decode = (fields: Fields, raw: Record<string, string>) => {
  const exit = Schema.decodeUnknownExit(structOf(fields))(raw);
  return exit._tag === 'Success' ? exit.value : undefined;
};

const encode = (fields: Fields, value: Value) =>
  Schema.encodeUnknownSync(structOf(fields))(
    Object.fromEntries(
      Object.keys(fields)
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, value[key]]),
    ),
  ) as Record<string, unknown>;

/** One segment, decoded; a malformed one names no place. */
const decodeSegment = (segment: string): string | undefined => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
};

/** The raw params a template's segments name, if the segments fit it exactly. */
const fit = (
  template: ReadonlyArray<string>,
  rest: ReadonlyArray<string>,
): Record<string, string> | undefined => {
  const raw: Record<string, string> = {};
  const fits = template.every((part, at) => {
    if (!part.startsWith(':')) return part === rest[at];
    raw[part.slice(1)] = rest[at]!;
    return true;
  });
  return fits ? raw : undefined;
};

/** The value a URL's segments name under one layer, if any. */
const match = (
  children: Children,
  rest: ReadonlyArray<string>,
  search: URLSearchParams,
): Value | undefined => {
  for (const [tag, node] of Object.entries(children)) {
    const template = segments(node.path);
    if (template.length > rest.length) continue;
    if (!hasChildren(node) && template.length !== rest.length) continue;
    const raw = fit(template, rest);
    if (!raw) continue;
    const params = decode(node.params, raw);
    const query = decode(
      node.query,
      Object.fromEntries(
        Object.keys(node.query).flatMap((key) => {
          const found = search.get(key);
          return found === null ? [] : [[key, found]];
        }),
      ),
    );
    if (!params || !query) continue;
    if (!hasChildren(node)) return { _tag: tag, ...params, ...query };
    const page = match(node.children, rest.slice(template.length), search);
    if (page) return { _tag: tag, ...params, ...query, page };
  }
  return undefined;
};

/** A value's segments and query under one layer. */
const write = (
  children: Children,
  value: Value,
  out: { segments: Array<string>; query: URLSearchParams },
) => {
  const node = children[value._tag];
  if (!node) return;
  const params = encode(node.params, value);
  for (const part of segments(node.path))
    out.segments.push(
      part.startsWith(':')
        ? encodeURIComponent(String(params[part.slice(1)]))
        : part,
    );
  for (const [key, found] of Object.entries(encode(node.query, value)))
    out.query.set(key, String(found));
  if (hasChildren(node)) write(node.children, value.page as Value, out);
};

/**
 * The Metadata of a value: the deepest node that says anything wins, field
 * by field. A node whose Metadata needs its Input says nothing until it has it.
 */
const metadataOf = (
  children: Children,
  value: Value | undefined,
  inputs: Inputs,
  at: ReadonlyArray<string> = [],
): Metadata => {
  if (!value) return {};
  const node = children[value._tag];
  if (!node) return {};
  const here = [...at, value._tag];
  const input = inputs[dotted(here)];
  const own =
    typeof node.metadata === 'function'
      ? node.input && input === undefined
        ? {}
        : node.metadata(value as never, input as never)
      : (node.metadata ?? {});
  const below = hasChildren(node)
    ? metadataOf(node.children, value.page as Value | undefined, inputs, here)
    : {};
  return merge(own, below);
};

// The tree ------------------------------------------------------------------------

type Options<C, D> = {
  readonly redirect?: Redirects<C, D>;
  readonly metadata?: Metadata;
  readonly notFound?: Metadata;
};

/**
 * Every place of an app, as one tree. `redirect` names paths that are never
 * a place, each with the Route it is replaced by, from the params its path
 * names: `{ '/posts/:slug': (r, { slug }) => r.Blog.Post({ slug }) }`.
 * `metadata` is the root's, under every place's; `notFound` the not-found
 * Route's, over the root's.
 * `extra` is what each node with children gets beside its children: the
 * outlet, which the router writes.
 */
export const treeWith = <C extends object, D>(
  children: C,
  options: Options<C, D> = {},
  extra: (node: AnyNode, at: ReadonlyArray<string>) => object,
) => {
  type Route = RouteOf<C>;
  type Name = NameOf<C>;
  const nodes = children as Children;
  checkModes(nodes);
  const ctors = wrapped(nodes, extra) as Tree<C, Route, {}>;
  const redirects = Object.entries(
    (options.redirect ?? {}) as Readonly<
      Record<
        string,
        (routes: Tree<C, Route, {}>, params: Record<string, string>) => Route
      >
    >,
  ).map(([from, to]) => ({ template: segments(from), to }));
  const read = (url: string): Read<Route> => {
    const { pathname, search } = new URL(url, 'http://route');
    const parts = segments(pathname).map(decodeSegment);
    const notFound = { _tag: 'NotFound', path: pathname } as Route;
    if (parts.some((part) => part === undefined))
      return { _tag: 'At', route: notFound };
    const rest = parts as Array<string>;
    for (const { template, to } of redirects) {
      if (template.length !== rest.length) continue;
      const params = fit(template, rest);
      if (params) return { _tag: 'Redirect', route: to(ctors, params) };
    }
    const found = match(nodes, rest, new URLSearchParams(search));
    return { _tag: 'At', route: (found as Route | undefined) ?? notFound };
  };
  const pathOf = (route: Route): string => {
    const value = route as Value;
    if (value._tag === 'NotFound') return String(value.path);
    const out = { segments: [] as Array<string>, query: new URLSearchParams() };
    write(nodes, value, out);
    const query = out.query.toString();
    return `/${out.segments.join('/')}${query ? `?${query}` : ''}`;
  };
  const routeOf = (of: Route | string) =>
    (typeof of === 'string' ? read(of).route : of) as Value;
  const inputs = inputsSchema(nodes, []);
  const everyPlace = allPlaces(nodes);
  const names = everyPlace.map((place) => place.name);
  return Object.assign(ctors, {
    /** The Schema of the root's Props: the whole Route, under `page`, and its Inputs. */
    props: Schema.Struct({
      page: levelSchema(nodes, true),
      ...(inputs ? { inputs: Schema.optionalKey(inputs) } : {}),
    }) as unknown as Codec<RootProps<C>>,
    /** The Schema of every Route. */
    route: levelSchema(nodes, true) as Codec<Route>,
    /** The Schema of every place's dotted name: `Blog.Post`. */
    place: (names.length > 0
      ? Schema.Literals(names as [string, ...Array<string>])
      : Schema.Never) as unknown as Codec<Name>,
    /** The Schema of the Inputs of a Route's places, by dotted name: each is there once loaded. */
    inputs: (inputs ?? Schema.Struct({})) as Codec<Inputs>,
    at: [] as ReadonlyArray<string>,
    /** The not-found Route, for a path that names no place. */
    NotFound: ({ path: where }: { readonly path: string }): NotFound => ({
      _tag: 'NotFound',
      path: where,
    }),
    /** A path and query, like `/projects/4?tab=files`, read as a Route. */
    read,
    /** A Route written as its path and query, without any base. */
    path: pathOf,
    /**
     * The Metadata of a Route, or of a URL, from the Inputs of its places:
     * pure, so a server can call it.
     */
    metadata: (of: Route | string, given: Inputs = {}): Metadata => {
      const value = routeOf(of);
      return merge(
        options.metadata ?? {},
        value._tag === 'NotFound'
          ? (options.notFound ?? {})
          : metadataOf(nodes, value, given),
      );
    },
    /** The places on a Route's path, from the root down, each with its params, Render Mode and Input's Schema. */
    places: (of: Route | string): ReadonlyArray<Place<Name>> => {
      const value = routeOf(of);
      return value._tag === 'NotFound'
        ? []
        : (placesOn(nodes, value) as ReadonlyArray<Place<Name>>);
    },
    /** Every place of the tree, as Schemas, from the root down. */
    every: everyPlace as ReadonlyArray<PlaceSchema<Name>>,
    /**
     * The Loaders of every place with an Input, by dotted name, checked by
     * type: one for each, and no other. A static place's is given its
     * params; a dynamic or client place's, the request too.
     */
    // Typed below, where the tree is returned.
    loaders: <L>(loaders: L): L => loaders,
    /** The nodes as written, for the router. */
    children,
    ...extra(
      {
        path: '/',
        params: {},
        query: {},
        input: undefined,
        render: undefined,
        metadata: undefined,
        children: nodes,
      },
      [],
    ),
  }) as Tree<C, Route, {}> & {
    /** Which Actor, or drawing, serves each top-level Route, and not-found if any. */
    readonly outlet: OutletOf<
      C & { readonly NotFound: Node<{ readonly path: typeof Schema.String }> },
      RootProps<C>,
      'NotFound'
    >;
    readonly props: Codec<RootProps<C>>;
    readonly route: Codec<Route>;
    readonly place: Codec<Name>;
    readonly inputs: Codec<Inputs>;
    readonly at: ReadonlyArray<string>;
    readonly NotFound: (args: { readonly path: string }) => NotFound;
    readonly read: (url: string) => Read<Route>;
    readonly path: (route: Route) => string;
    readonly metadata: (of: Route | string, inputs?: Inputs) => Metadata;
    readonly places: (of: Route | string) => ReadonlyArray<Place<Name>>;
    readonly every: ReadonlyArray<PlaceSchema<Name>>;
    readonly loaders: <const L extends Partial<LoadersOf<PlacesOf<C>>>>(
      loaders: Exactly<L, LoaderNames<C>> & Partial<LoadersOf<PlacesOf<C>>>,
    ) => L;
    readonly children: C;
  };
};

/** Constructors whose values are whole Routes: each nested call wraps its value in its ancestors'. */
const wrapped = (
  children: Children,
  extra: (node: AnyNode, at: ReadonlyArray<string>) => object,
) => {
  const build = (
    layer: Children,
    at: ReadonlyArray<string>,
    wrap: (value: Value, args: Record<string, unknown>) => Value,
  ): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(layer).map(([tag, node]) => {
        const here = [...at, tag];
        const own = (args: Record<string, unknown>) =>
          Object.fromEntries(
            [...Object.keys(node.params), ...Object.keys(node.query)]
              .filter((key) => args[key] !== undefined)
              .map((key) => [key, args[key]]),
          );
        const api = {
          props: Schema.Struct(propsFieldsOf(node, here)),
          at: here,
          ...(node.input ? { input: node.input } : {}),
        };
        if (!hasChildren(node))
          return [
            tag,
            Object.assign(
              (args: Record<string, unknown> = {}) =>
                wrap({ _tag: tag, ...own(args) }, args),
              api,
            ),
          ];
        return [
          tag,
          {
            ...api,
            ...extra(node, here),
            ...build(node.children, here, (value, args) =>
              wrap({ _tag: tag, ...own(args), page: value }, args),
            ),
          },
        ];
      }),
    );
  return build(children, [], (value) => value);
};

export { NotFoundError, RedirectError } from './loader.ts';
export type { LoadError, PlaceType, RenderMode } from './loader.ts';
export { MANAGED, tagsOf } from './metadata.ts';
export type { Metadata, Tag } from './metadata.ts';
