import { Schema } from 'effect';
import type { RenderMode } from './loader.ts';
import { dotted } from './node.ts';
import type {
  AnyNode,
  Children,
  Codec,
  Fields,
  Place,
  PlaceSchema,
  Value,
} from './node.ts';
import { pick } from './values.ts';

/*
 * A Route's places: those on its path, each with its key, what its Loader
 * is handed, its Render Mode and its data; and every place of the tree as
 * Schemas, with the Stale time each is kept fresh for.
 */

/** The places on a Route's path, from the root down. The not-found Route has none. */
export const placesOn = (
  children: Children,
  route: Value,
): ReadonlyArray<Place> => {
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
    params = { ...params, ...pick(node.params, value) };
    render = (node.render as RenderMode | undefined) ?? render;
    const name = dotted(at);
    out.push({
      name,
      key: JSON.stringify([name, params]),
      params: { ...params, ...pick(node.query, value) },
      render,
      input: node.input,
    });
    layer = node.children;
    value = value.page as Value | undefined;
  }
  return out;
};

/** The nodes on a Route's path, from the root down, each with its dotted name. */
export const nodesOn = (
  children: Children,
  route: Value,
): ReadonlyArray<readonly [string, AnyNode]> => {
  const nodes: Array<readonly [string, AnyNode]> = [];
  let layer = children;
  let value: Value | undefined = route;
  const at: Array<string> = [];
  while (value) {
    const node: AnyNode | undefined = layer[value._tag];
    if (!node) break;
    at.push(value._tag);
    nodes.push([dotted(at), node]);
    layer = node.children;
    value = value.page as Value | undefined;
  }
  return nodes;
};

/**
 * Every place of the tree, as Schemas, from the root down. A place's Stale
 * time is its own, else its parent's, else `staleTime`; a static place's is
 * `Infinity`, and one that says its own throws.
 */
export const allPlaces = (
  children: Children,
  staleTime = 0,
  at: ReadonlyArray<string> = [],
  params: Fields = {},
  render: RenderMode = 'static',
): ReadonlyArray<PlaceSchema> =>
  Object.entries(children).flatMap(([tag, node]) => {
    const here = [...at, tag];
    const name = dotted(here);
    const fields = { ...params, ...node.params };
    const mode = (node.render as RenderMode | undefined) ?? render;
    if (mode === 'static' && node.staleTime !== undefined)
      throw new Error(
        `[@kestack/kabuki/routing] ${name} is static: its data is fresh until the next deploy, so it has no staleTime`,
      );
    const stale = node.staleTime ?? staleTime;
    return [
      {
        name,
        params: Schema.Struct({ ...fields, ...node.query }) as unknown as Codec<
          Record<string, unknown>
        >,
        render: mode,
        staleTime: mode === 'static' ? Infinity : stale,
        input: node.input,
      },
      ...allPlaces(node.children, stale, here, fields, mode),
    ];
  });

/** Every path of the tree, as written from the root: `/projects/:id/tasks/:task`. */
export const pathsOf = (
  children: Children,
  above = '',
): ReadonlyArray<readonly [string, string]> =>
  Object.entries(children).flatMap(([tag, node]) => {
    const own = node.path.split('/').filter(Boolean).join('/');
    const path = own ? `${above}/${own}` : above;
    return [
      [tag, path || '/'] as const,
      ...pathsOf(node.children, path).map(
        ([name, written]) => [`${tag}.${name}`, written] as const,
      ),
    ];
  });
