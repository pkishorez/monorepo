import { useMemo, useRef } from 'react';

// The value fields of a row, without what the Collection adds.
const plain = <T extends object>(row: T): T => {
  const {
    _meta: _,
    $synced: __,
    $origin: ___,
    ...value
  } = row as T & {
    _meta?: unknown;
    $synced?: unknown;
    $origin?: unknown;
  };
  return value as T;
};

// Whether two rows hold the same values, field by field.
const same = (a: object, b: object) => {
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.is(left[key], right[key]))
  );
};

export const byId = (row: { readonly id: string }) => row.id;

/**
 * A query's rows as plain values, each the same object from one change to
 * the next while its values are the same, so a screen that draws a row only
 * when it changes (a memoised row) skips the rows a write left alone. Empty
 * until `ready`.
 */
export const usePlain = <T extends object>(
  data: ReadonlyArray<unknown>,
  ready: boolean,
  keyOf: (row: T) => string,
): ReadonlyArray<T> => {
  const kept = useRef(new Map<string, T>());
  return useMemo(() => {
    if (!ready) return [];
    const next = new Map<string, T>();
    const rows = data.map((row) => {
      const value = plain(row as T);
      const key = keyOf(value);
      const before = kept.current.get(key);
      const stable =
        before !== undefined && same(before, value) ? before : value;
      next.set(key, stable);
      return stable;
    });
    kept.current = next;
    return rows;
  }, [data, ready, keyOf]);
};
