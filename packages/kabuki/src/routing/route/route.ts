import { Schema } from 'effect';
import type { OutletOf } from './outlet.ts';

/*
 * Routes are written once, as a tree of `Route.path` nodes. The same tree is
 * a Schema for every level, a constructor for every place, both directions
 * between a URL and a Route, and each place's head. It holds no state and
 * runs nothing.
 *
 * A Route value is one tagged object per level: a node with children holds
 * the one below it under `page`.
 *
 *   Routes.Settings.Billing()  →  { _tag: 'Settings', page: { _tag: 'Billing' } }
 *
 * What a node's Actor is handed as Props is its value without the tag: its
 * params and query, and, if it has children, `page`. The root's Props are
 * `{ page }`, the whole Route.
 */

type Fields = Schema.Struct.Fields;
/** A Schema read and written without Capabilities and at once. */
export type Codec<T> = Schema.Codec<T, unknown, never, never>;

/** What a place says about itself: its title and meta tags. */
export interface Head {
  readonly title?: string;
  readonly meta?: ReadonlyArray<{
    readonly name?: string;
    readonly property?: string;
    readonly content: string;
  }>;
}

/** One node: a path template, its params and query, its head, and the nodes under it. */
export interface Node<
  P extends Fields = {},
  Q extends Fields = {},
  C extends object = {},
> {
  readonly path: string;
  readonly params: P;
  readonly query: Q;
  readonly head:
    | Head
    | ((values: Schema.Struct.Type<P & Q>) => Head)
    | undefined;
  readonly children: C;
}

export type AnyNode = Node<any, any, any>;
export type Children = { readonly [tag: string]: AnyNode };

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type IsEmpty<C> = [keyof C] extends [never] ? true : false;

type OwnOf<N> =
  N extends Node<infer P, infer Q, any> ? Schema.Struct.Type<P & Q> : never;
type ChildrenOf<N> = N extends Node<any, any, infer C> ? C : never;

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

/** What a node's Actor is handed as Props: its value without the tag. */
export type PropsOf<N> = Simplify<
  OwnOf<N> &
    (IsEmpty<ChildrenOf<N>> extends true
      ? {}
      : { readonly page: LevelOf<ChildrenOf<N>> })
>;

/** The root's Props: the whole Route, under `page`. */
export type RootProps<C> = { readonly page: RouteOf<C> };

type Ctor<Args, R> = {} extends Args ? (args?: Args) => R : (args: Args) => R;

/**
 * What one node is in the tree a user holds: its Props' Schema and where it
 * sits; a place to call when it has no children, else its children and its
 * outlet.
 */
export type NodeApi<N, R, Args> = {
  /** The Schema of what this node's Actor is handed as Props. */
  readonly props: Codec<PropsOf<N>>;
  /** Where this node sits: the tags from the root. */
  readonly at: ReadonlyArray<string>;
} & (IsEmpty<ChildrenOf<N>> extends true
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

/** What reading a URL gives: the Route it names, or the Route it is replaced by. */
export type Read<R> =
  | { readonly _tag: 'At'; readonly route: R }
  | { readonly _tag: 'Redirect'; readonly route: R };

/**
 * A place: `Route.path('/projects/:id', { params: { id: Schema.FiniteFromString } })`,
 * with the nodes under it as a third argument.
 */
export const path = <
  P extends Fields = {},
  Q extends Fields = {},
  C extends object = {},
>(
  template: string,
  options?: {
    readonly params?: P;
    readonly query?: Q;
    readonly head?: Head | ((values: Schema.Struct.Type<P & Q>) => Head);
  },
  children?: C,
): Node<P, Q, C> => ({
  path: template,
  params: (options?.params ?? {}) as P,
  query: (options?.query ?? {}) as Q,
  head: options?.head as never,
  children: (children ?? {}) as C,
});

// Values --------------------------------------------------------------------------

export type Value = {
  readonly _tag: string;
  readonly [field: string]: unknown;
};

const segments = (template: string) => template.split('/').filter(Boolean);
const hasChildren = (node: AnyNode) => Object.keys(node.children).length > 0;

/** The Schema of the fields a node's value holds besides its tag. */
const fieldsOf = (node: AnyNode): Fields => ({
  ...node.params,
  ...node.query,
  ...(hasChildren(node) ? { page: levelSchema(node.children, false) } : {}),
});

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
    const raw: Record<string, string> = {};
    const fits = template.every((part, at) => {
      if (!part.startsWith(':')) return part === rest[at];
      raw[part.slice(1)] = rest[at]!;
      return true;
    });
    if (!fits) continue;
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

/** The head of a value: the deepest node that says anything wins, field by field. */
const headOf = (children: Children, value: Value | undefined): Head => {
  if (!value) return {};
  const node = children[value._tag];
  if (!node) return {};
  const own =
    typeof node.head === 'function'
      ? node.head(value as never)
      : (node.head ?? {});
  const below = hasChildren(node)
    ? headOf(node.children, value.page as Value | undefined)
    : {};
  return { ...own, ...below };
};

// The tree ------------------------------------------------------------------------

/**
 * Every place of an app, as one tree. `redirect` names paths that are never
 * a place, each with the Route it is replaced by: `{ '/account': (r) => r.Settings.Profile() }`.
 * `extra` is what each node with children gets beside its children: the
 * outlet, which the router writes.
 */
export const treeWith = <C extends object>(
  children: C,
  options: {
    readonly redirect?: Readonly<
      Record<string, (routes: Tree<C, RouteOf<C>, {}>) => RouteOf<C>>
    >;
  } = {},
  extra: (node: AnyNode, at: ReadonlyArray<string>) => object,
) => {
  type Route = RouteOf<C>;
  const nodes = children as Children;
  const ctors = wrapped(nodes, extra) as Tree<C, Route, {}>;
  const redirects = new Map(
    Object.entries(options.redirect ?? {}).map(([from, to]) => [
      `/${segments(from).join('/')}`,
      to,
    ]),
  );
  const read = (url: string): Read<Route> => {
    const { pathname, search } = new URL(url, 'http://route');
    const parts = segments(pathname).map(decodeSegment);
    const notFound = { _tag: 'NotFound', path: pathname } as Route;
    if (parts.some((part) => part === undefined))
      return { _tag: 'At', route: notFound };
    const to = redirects.get(`/${parts.join('/')}`);
    if (to) return { _tag: 'Redirect', route: to(ctors) };
    const found = match(
      nodes,
      parts as Array<string>,
      new URLSearchParams(search),
    );
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
  return Object.assign(ctors, {
    /** The Schema of the root's Props: the whole Route, under `page`. */
    props: Schema.Struct({
      page: levelSchema(nodes, true),
    }) as unknown as Codec<RootProps<C>>,
    /** The Schema of every Route. */
    route: levelSchema(nodes, true) as Codec<Route>,
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
    /** The title and meta tags of a Route, or of a URL: pure, so a server can call it. */
    head: (of: Route | string): Head => {
      const route = typeof of === 'string' ? read(of).route : of;
      return headOf(nodes, route as Value);
    },
    /** The nodes as written, for the router. */
    children,
    ...extra(
      { path: '/', params: {}, query: {}, head: undefined, children: nodes },
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
    readonly at: ReadonlyArray<string>;
    readonly NotFound: (args: { readonly path: string }) => NotFound;
    readonly read: (url: string) => Read<Route>;
    readonly path: (route: Route) => string;
    readonly head: (of: Route | string) => Head;
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
        const api = { props: Schema.Struct(fieldsOf(node)), at: here };
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
