import { Schema } from 'effect';
import { hasChildren, segments } from './node.ts';
import type { Children, Codec, Fields, Value } from './node.ts';

/*
 * A URL read as a value and a value written as a URL, layer by layer:
 * path segments by each node's template and params Schema, the query by
 * its query Schema.
 */

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
export const decodeSegment = (segment: string): string | undefined => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
};

/** The raw params a template's segments name, if the segments fit it exactly. */
export const fit = (
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
export const match = (
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
export const write = (
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
