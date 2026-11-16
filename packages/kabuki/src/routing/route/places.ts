import { Schema } from 'effect';
import { MODES } from './loader.ts';
import type { RenderMode } from './loader.ts';
import { dotted, segments } from './node.ts';
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
  staleTimes: ReadonlyMap<string, number>,
  root: RenderMode = 'static',
): ReadonlyArray<Place> => {
  const out: Array<Place> = [];
  let layer = children;
  let value: Value | undefined = route;
  const at: Array<string> = [];
  let params: Record<string, unknown> = {};
  let render = root;
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
      // A static place is the same whatever the query: its Loader is not handed it.
      params:
        render === 'static'
          ? params
          : { ...params, ...pick(node.query, value) },
      render,
      staleTime: staleTimes.get(name) ?? 0,
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
 * `Infinity`, and one that says its own throws. So does a place that says
 * an earlier Render Mode than the page above it.
 */
export const allPlaces = (
  children: Children,
  staleTime = 0,
  at: ReadonlyArray<string> = [],
  params: Fields = {},
  render: RenderMode = 'static',
  keys: ReadonlyArray<string> = [],
): ReadonlyArray<PlaceSchema> =>
  Object.entries(children).flatMap(([tag, node]) => {
    const here = [...at, tag];
    const name = dotted(here);
    const fields = { ...params, ...node.params };
    const said = node.render as RenderMode | undefined;
    if (said !== undefined && MODES.indexOf(said) < MODES.indexOf(render))
      throw new Error(
        `[@kestack/kabuki/routing] ${name} is ${said} under a ${render} page: a page is never drawn earlier than the page above it`,
      );
    const mode = said ?? render;
    const own = segments(node.path)
      .filter((part) => part.startsWith(':'))
      .map((part) => part.slice(1));
    const down = [...keys, ...own];
    if (mode === 'static' && node.staleTime !== undefined)
      throw new Error(
        `[@kestack/kabuki/routing] ${name} is static: its data is fresh until the next deploy, so it has no staleTime`,
      );
    const stale = node.staleTime ?? staleTime;
    return [
      {
        name,
        // A static place is the same whatever the query: its Loader is not handed it.
        params: Schema.Struct(
          mode === 'static' ? fields : { ...fields, ...node.query },
        ) as unknown as Codec<Record<string, unknown>>,
        keys: down,
        lists: own.length > 0,
        render: mode,
        staleTime: mode === 'static' ? Infinity : stale,
        input: node.input,
      },
      ...allPlaces(node.children, stale, here, fields, mode, down),
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
