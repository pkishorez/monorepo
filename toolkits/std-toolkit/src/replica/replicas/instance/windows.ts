import { parseLoadSubsetOptions, type LoadSubsetOptions } from '@tanstack/db';
import type { KeyPathValue, TotalKeyPath } from '../../../db/index.js';
import type { AnyEntityESchema } from '../../../eschema/index.js';
import type { WindowValue } from './model.js';
import type { Strategy } from './strategy/index.js';

/*
 * Windows: the records of one Collection whose field reads one value. A
 * Build names the fields a Collection opens Windows on, each with the
 * Strategy of one value; a Query's `where` says which are open.
 *
 * 1. Read   an `eq` on a named field opens one Window; an `inArray` one
 *           per value. Any other filter opens none.
 * 2. Name   each Strategy's scope, as its cursor and its Worker know it:
 *           `strategy` for the whole Collection, `walletId="7"` for one
 *           Window.
 */

/**
 * The Strategy of each Window of a Collection, by the field it reads: a key
 * path that reads a string, number or boolean in every value. Its factory
 * gets the Window's value.
 */
export type WindowMap<K, S extends AnyEntityESchema, R = never> = {
  readonly [P in TotalKeyPath<S['Type'], WindowValue>]?: (
    value: KeyPathValue<S['Type'], P, WindowValue>,
  ) => Strategy<K, any, R>;
};

export interface WindowAt {
  readonly path: string;
  readonly value: WindowValue;
}

const isValue = (value: unknown): value is WindowValue =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

// 1. Read
/** The Windows a Query's `where` opens, among `paths`. */
export const windowsOf = (
  options: LoadSubsetOptions,
  paths: ReadonlyArray<string>,
): ReadonlyArray<WindowAt> => {
  let filters: ReturnType<typeof parseLoadSubsetOptions>['filters'];
  try {
    filters = parseLoadSubsetOptions(options).filters;
  } catch {
    // A filter TanStack DB cannot take apart, such as `or`, opens none.
    return [];
  }
  // Field references come relative to the Collection, the query's alias
  // already taken off, so a path matches the whole reference.
  const pathOf = (field: ReadonlyArray<unknown>) =>
    paths.find((path) => field.map(String).join('.') === path);
  for (const filter of filters) {
    const path = pathOf(filter.field);
    if (path === undefined) continue;
    if (filter.operator === 'eq' && isValue(filter.value))
      return [{ path, value: filter.value }];
    if (filter.operator === 'in' && Array.isArray(filter.value))
      return [...new Set(filter.value.filter(isValue))].map((value) => ({
        path,
        value,
      }));
  }
  return [];
};

// 2. Name
/** The whole Collection's scope. */
export const WHOLE = 'strategy';

/** A Strategy's scope: the whole Collection's, or one Window's. */
export const scopeOf = (window: WindowAt | null) =>
  window === null ? WHOLE : `${window.path}=${JSON.stringify(window.value)}`;

/** A Strategy's Worker key, as `entries/walletId="7"`. */
export const workerKey = (collection: string, window: WindowAt | null) =>
  `${collection}/${scopeOf(window)}`;
