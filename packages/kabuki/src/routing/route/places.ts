import { Schema } from 'effect';
import { MODES } from './loader.ts';
import type { RenderMode } from './loader.ts';
import { dotted, hasChildren } from './node.ts';
import type {
  AnyNode,
  Children,
  Codec,
  Fields,
  Place,
  PlaceSchema,
  Value,
} from './node.ts';

/*
 * A Route's places: those on its path, each with every param down to it,
 * its Render Mode and its Input; every place of the tree as Schemas; and
 * the check that no place is drawn earlier than the place that holds it.
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
export const allPlaces = (
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
export const checkModes = (
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
