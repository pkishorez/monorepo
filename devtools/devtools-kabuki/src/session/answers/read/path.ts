/*
 * A part of a JSON value, and a large value made small enough to read.
 *
 * 1. Path     a dot path down a value, `children.page.model.items.0`;
 *             where it stops, the keys there are.
 * 2. Summary  past a few levels, an object or a list folded to a count,
 *             a long list cut to its first items, and a long string cut,
 *             when the whole is large.
 */

// 1. Path
export type Read =
  | { readonly found: true; readonly value: unknown }
  | {
      readonly found: false;
      /** The longest part of the path that is there. */
      readonly at: string;
      readonly available: ReadonlyArray<string>;
    };

const keysOf = (value: unknown): ReadonlyArray<string> =>
  typeof value === 'object' && value !== null ? Object.keys(value) : [];

export const readPath = (value: unknown, path: string): Read => {
  const parts = path.split('.').filter((part) => part !== '');
  let here = value;
  for (const [index, part] of parts.entries()) {
    if (typeof here !== 'object' || here === null || !Object.hasOwn(here, part))
      return {
        found: false,
        at: parts.slice(0, index).join('.'),
        available: keysOf(here),
      };
    here = (here as Readonly<Record<string, unknown>>)[part];
  }
  return { found: true, value: here };
};

// 2. Summary
/** About how many characters of JSON a value may take before it is summarized. */
const LARGE = 8_000;
const DEPTH = 3;
const STRING = 200;
const ITEMS = 20;

/** The value as it is when small, else folded below `DEPTH` levels; and whether anything was. */
export const summarize = (
  value: unknown,
): { readonly value: unknown; readonly summarized: boolean } => {
  if ((JSON.stringify(value) ?? '').length <= LARGE)
    return { value, summarized: false };
  let summarized = false;
  const fold = (inner: unknown, depth: number): unknown => {
    if (typeof inner === 'string' && inner.length > STRING) {
      summarized = true;
      return `${inner.slice(0, STRING)}… (${inner.length} characters)`;
    }
    if (typeof inner !== 'object' || inner === null) return inner;
    if (depth >= DEPTH) {
      summarized = true;
      return Array.isArray(inner)
        ? `[… ${inner.length} items]`
        : `{… ${Object.keys(inner).length} keys}`;
    }
    if (Array.isArray(inner)) {
      const items = inner.slice(0, ITEMS).map((one) => fold(one, depth + 1));
      if (inner.length <= ITEMS) return items;
      summarized = true;
      return [...items, `… ${inner.length - ITEMS} more items`];
    }
    return Object.fromEntries(
      Object.entries(inner).map(([key, one]) => [key, fold(one, depth + 1)]),
    );
  };
  const folded = fold(value, 0);
  return { value: folded, summarized };
};
