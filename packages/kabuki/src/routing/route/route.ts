import { Schema } from 'effect';
import type { Exactly, Loaders, LoadersOf } from './loader.ts';
import { merge } from './metadata.ts';
import type { Metadata } from './metadata.ts';
import { dotted } from './node.ts';
import type {
  AnyNode,
  Children,
  Codec,
  LoaderNames,
  NameOf,
  NotFound,
  Place,
  PlaceData,
  PlaceSchema,
  PlacesOf,
  Read,
  Redirects,
  RouteOf,
  StaticNames,
  Tree,
  Value,
} from './node.ts';
import { allPlaces, pathsOf, placesOn } from './places.ts';
import { decodeSegment, fit, match, write } from './url.ts';
import { dataSchemas, levelSchema, pick } from './values.ts';

/*
 * The Routes, worked out from the pages under the root: a Schema for every
 * level, a constructor for every place, both directions between a URL and
 * a Route, each place's data, Render Mode and Metadata, and the type of
 * every Loader. It holds no state and runs nothing.
 *
 * A Route value is one tagged object per level, the one below under `page`
 * when the URL goes on:
 *
 *   router.Settings.Billing()  →  { _tag: 'Settings', page: { _tag: 'Billing' } }
 *   router.Settings()          →  { _tag: 'Settings' }
 *
 * A place is named by its tags from the root, dotted: `Settings.Billing`.
 * This file makes the Routes from their parts: `node.ts` the types,
 * `values.ts` each level's Schemas, `places.ts` the places, `url.ts` a URL
 * both ways, and `metadata.ts` the Metadata.
 */

/**
 * The Metadata of a value: the deepest node that says anything wins, field
 * by field. A node whose Metadata is a function is handed its data, or
 * `undefined` until it is there.
 */
const metadataOf = (
  children: Children,
  value: Value | undefined,
  data: PlaceData,
  at: ReadonlyArray<string> = [],
): Metadata => {
  if (!value) return {};
  const node = children[value._tag];
  if (!node) return {};
  const here = [...at, value._tag];
  const own =
    typeof node.metadata === 'function'
      ? node.metadata(
          { ...pick(node.params, value), ...pick(node.query, value) },
          data[dotted(here)],
        )
      : (node.metadata ?? {});
  const below = metadataOf(
    node.children,
    value.page as Value | undefined,
    data,
    here,
  );
  return merge(own, below);
};

/** Throws, naming both, if two places are written at the same path and neither holds the other. */
const checkPaths = (children: Children) => {
  const seen = new Map<string, string>();
  for (const [name, path] of pathsOf(children)) {
    const shape = path.replace(/:[^/]+/g, ':');
    const before = seen.get(shape);
    if (
      before !== undefined &&
      !name.startsWith(`${before}.`) &&
      !before.startsWith(`${name}.`)
    )
      throw new Error(
        `[@kestack/kabuki/routing] ${before} and ${name} are both at ${path}: a URL must name one place`,
      );
    if (before === undefined) seen.set(shape, name);
  }
};

export type RoutesOptions<C, D> = {
  readonly redirect?: Redirects<C, D>;
  /** The root's Metadata, under every place's: the site's name, its default description. */
  readonly metadata?: Metadata;
  /** The not-found Route's Metadata, over the root's. */
  readonly notFound?: Metadata;
};

/** What `routesOf` gives besides a constructor per place. */
export interface RoutesApi<C> {
  /** The Schema of every Route. */
  readonly route: Codec<RouteOf<C>>;
  /** The Schema of every place's dotted name: `Blog.Post`. */
  readonly place: Codec<NameOf<C>>;
  /** The not-found Route, for a path that names no place. */
  readonly NotFound: (args: { readonly path: string }) => NotFound;
  /** A path and query, like `/projects/4?tab=files`, read as a Route. */
  readonly read: (url: string) => Read<RouteOf<C>>;
  /** A Route written as its path and query, without any base. */
  readonly path: (route: RouteOf<C>) => string;
  /** Every place's path, as written from the root, by dotted name. */
  readonly paths: () => Readonly<Record<string, string>>;
  /** The Metadata of a Route, or of a URL, from the data of its places: pure, so a server can call it. */
  readonly metadata: (of: RouteOf<C> | string, data?: PlaceData) => Metadata;
  /** The places on a Route's path, from the root down. */
  readonly places: (of: RouteOf<C> | string) => ReadonlyArray<Place<NameOf<C>>>;
  /** Every place of the tree, as Schemas, from the root down. */
  readonly every: ReadonlyArray<PlaceSchema<NameOf<C>>>;
  /** Every place with data, by dotted name, with its data's Schema. */
  readonly data: ReadonlyArray<readonly [string, Codec<unknown>]>;
  /**
   * The Loaders of every place with data, by dotted name, checked by type:
   * one for each, and no other. A static place's is given its params and
   * query; a dynamic or client place's, the request too.
   */
  readonly loaders: <const L extends Partial<LoadersOf<PlacesOf<C>>>>(
    loaders: Exactly<L, LoaderNames<C>> & Partial<LoadersOf<PlacesOf<C>>>,
  ) => Loaders<L, StaticNames<C>>;
  /** The nodes as written. */
  readonly children: C;
}

/**
 * Every place of an app, from the nodes under the root. `redirect` names
 * paths that are never a place, each with the Route it is replaced by,
 * from the params its path names:
 * `{ '/posts/:slug': (r, { slug }) => r.Blog.Post({ slug }) }`.
 */
export const routesOf = <C extends object, D>(
  children: C,
  options: RoutesOptions<C, D> = {},
): Tree<C, RouteOf<C>, {}> & RoutesApi<C> => {
  type Route = RouteOf<C>;
  const nodes = children as Children;
  checkPaths(nodes);
  const ctors = constructors(nodes) as Tree<C, Route, {}>;
  const redirects = Object.entries(
    (options.redirect ?? {}) as Readonly<
      Record<
        string,
        (routes: Tree<C, Route, {}>, params: Record<string, string>) => Route
      >
    >,
  ).map(([from, to]) => ({ template: from.split('/').filter(Boolean), to }));
  const read = (url: string): Read<Route> => {
    const { pathname, search } = new URL(url, 'http://route');
    const parts = pathname.split('/').filter(Boolean).map(decodeSegment);
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
  const every = allPlaces(nodes);
  const names = every.map((place) => place.name);
  const api: RoutesApi<C> = {
    route: levelSchema(nodes, true) as Codec<Route>,
    place: (names.length > 0
      ? Schema.Literals(names as [string, ...Array<string>])
      : Schema.Never) as unknown as Codec<NameOf<C>>,
    NotFound: ({ path }) => ({ _tag: 'NotFound', path }),
    read,
    path: pathOf,
    paths: () => Object.fromEntries(pathsOf(nodes)),
    metadata: (of, data = {}) => {
      const value = routeOf(of);
      return merge(
        options.metadata ?? {},
        value._tag === 'NotFound'
          ? (options.notFound ?? {})
          : metadataOf(nodes, value, data),
      );
    },
    places: (of) => {
      const value = routeOf(of);
      return (
        value._tag === 'NotFound' ? [] : placesOn(nodes, value)
      ) as ReadonlyArray<Place<NameOf<C>>>;
    },
    every: every as ReadonlyArray<PlaceSchema<NameOf<C>>>,
    data: dataSchemas(nodes),
    // Typed by `RoutesApi`.
    loaders: ((loaders: unknown) => loaders) as RoutesApi<C>['loaders'],
    children,
  };
  return Object.assign(ctors, api);
};

/**
 * A constructor per node, whose value is a whole Route: each nested call
 * wraps its value in its ancestors'. A node with children is a function
 * too, for the URL that ends at it.
 */
const constructors = (children: Children) => {
  const build = (
    layer: Children,
    at: ReadonlyArray<string>,
    wrap: (value: Value, args: Record<string, unknown>) => Value,
  ): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(layer).map(([tag, node]: [string, AnyNode]) => {
        const here = [...at, tag];
        const own = (args: Record<string, unknown>) => ({
          _tag: tag,
          ...pick(node.params, args as Value),
          ...pick(node.query, args as Value),
        });
        const make = (args: Record<string, unknown> = {}) =>
          wrap(own(args), args);
        return [
          tag,
          Object.assign(make, {
            at: here,
            ...(node.input ? { data: node.input } : {}),
            ...build(node.children, here, (value, args) =>
              wrap({ ...own(args), page: value }, args),
            ),
          }),
        ];
      }),
    );
  return build(children, [], (value) => value);
};
