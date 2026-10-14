import { Schema } from 'effect';
import { dotted, hasChildren } from './node.ts';
import type {
  AnyNode,
  Children,
  Codec,
  Fields,
  Inputs,
  Value,
} from './node.ts';

/*
 * A Route's values: the Schema of each level and of each node's Props, the
 * value one level down, the key of a node's params, and the Inputs a node
 * hands down.
 */

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
export const propsFieldsOf = (
  node: AnyNode,
  at: ReadonlyArray<string>,
): Fields => {
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
