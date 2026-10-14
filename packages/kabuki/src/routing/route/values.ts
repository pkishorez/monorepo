import { Schema } from 'effect';
import { dotted } from './node.ts';
import type { AnyNode, Children, Codec, Fields, Value } from './node.ts';

/*
 * A Route's values: the Schema of each level, the key of a node's params,
 * the own params and query of a value, and every place's data Schema.
 */

/** The Schema of the fields a node's value holds besides its tag. */
const fieldsOf = (node: AnyNode): Fields => ({
  ...node.params,
  ...node.query,
  ...(Object.keys(node.children).length > 0
    ? { page: Schema.optionalKey(levelSchema(node.children, false)) }
    : {}),
});

const cache = new WeakMap<object, Codec<unknown>>();
/** The Schema of one level: a case per child, and at the root the not-found Route. */
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

/** Every place with data, by dotted name, with its data's Schema. */
export const dataSchemas = (
  children: Children,
  at: ReadonlyArray<string> = [],
): ReadonlyArray<readonly [string, Codec<unknown>]> =>
  Object.entries(children).flatMap(([tag, node]) => [
    ...(node.input
      ? [[dotted([...at, tag]), node.input as Codec<unknown>] as const]
      : []),
    ...dataSchemas(node.children, [...at, tag]),
  ]);

/** The fields of a value that `fields` names. */
export const pick = (
  fields: Fields,
  value: Value | undefined,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.keys(fields)
      .filter((key) => value?.[key] !== undefined)
      .map((key) => [key, value![key]]),
  );

/** The params of a node's value, as one string: two values with the same params are the same place. */
export const paramsKey = (node: AnyNode, value: Value): string =>
  JSON.stringify(Object.keys(node.params).map((key) => value[key]));

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
