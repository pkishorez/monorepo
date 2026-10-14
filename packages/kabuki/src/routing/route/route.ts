import { Schema } from 'effect';
import type { Exactly, Loaders, LoadersOf } from './loader.ts';
import { merge } from './metadata.ts';
import type { Metadata } from './metadata.ts';
import { dotted, hasChildren, segments } from './node.ts';
import type {
  AnyNode,
  Children,
  Codec,
  Inputs,
  LoaderNames,
  NameOf,
  Node,
  NotFound,
  Place,
  PlaceSchema,
  PlacesOf,
  Read,
  Redirects,
  RootProps,
  RouteOf,
  StaticNames,
  Tree,
  Value,
} from './node.ts';
import type { OutletOf } from './outlet.ts';
import { allPlaces, checkModes, placesOn } from './places.ts';
import { decodeSegment, fit, match, write } from './url.ts';
import { inputsSchema, levelSchema, propsFieldsOf } from './values.ts';

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
 *
 * This file makes the tree from its parts: `node.ts` the types and
 * `Route.path`, `values.ts` each level's Schemas, `places.ts` the places,
 * `url.ts` a URL both ways, and `metadata.ts` the Metadata.
 */

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
    ) => Loaders<L, StaticNames<C>>;
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
