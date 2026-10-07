import { parseLoadSubsetOptions } from '@tanstack/query-db-collection';
import type { LoadSubsetOptions } from '@tanstack/react-db';
import {
  windowKey as makeWindowKey,
  type WindowKey,
  type WindowValue,
} from '../domain/identity/index.js';

export type ActiveWindow = {
  readonly path: string;
  readonly value: WindowValue;
  readonly key: WindowKey;
};

// TanStack DB hands `loadSubset` field references relative to the collection
// (the query alias already removed), so a key path matches the whole reference.
const resolve = (
  options: LoadSubsetOptions,
  paths: readonly string[],
): ActiveWindow | null => {
  const pathOf = (reference: readonly unknown[]) =>
    paths.find((path) => reference.map(String).join('.') === path);
  // The first `eq` filter on a window key path names the Window.
  const match = parseLoadSubsetOptions(options).filters.find(
    (filter) => filter.operator === 'eq' && pathOf(filter.field) !== undefined,
  );
  if (!match) return null;
  const value = match.value;
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  )
    return null;
  const path = pathOf(match.field)!;
  return { path, value, key: makeWindowKey({ [path]: value }) };
};

/**
 * Counts the queries using each Window. A Window becomes active with
 * its first query and inactive when its last one leaves.
 */
export const makeWindows = (paths: readonly string[]) => {
  const counts = new Map<WindowKey, number>();
  return {
    load: (options: LoadSubsetOptions) => {
      const active = resolve(options, paths);
      if (!active) return null;
      const count = (counts.get(active.key) ?? 0) + 1;
      counts.set(active.key, count);
      return { window: active, activated: count === 1 };
    },
    unload: (options: LoadSubsetOptions) => {
      const active = resolve(options, paths);
      if (!active) return null;
      const count = Math.max(0, (counts.get(active.key) ?? 0) - 1);
      if (count === 0) counts.delete(active.key);
      else counts.set(active.key, count);
      return { window: active, deactivated: count === 0 };
    },
    clear: () => counts.clear(),
  };
};
