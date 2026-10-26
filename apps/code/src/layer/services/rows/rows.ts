import { Effect } from 'effect';
import type { Entity } from '@kestack/std-toolkit/core';
import type { QueryOptions, QueryPage } from '@kestack/std-toolkit/db';

/*
 * What every store on this device does with its rows the same way, Device
 * State, the kept copies and the Saved Drafts alike.
 *
 * 1. Key     a row's key, made of its ids.
 * 2. Scan    every row, read a page at a time, to prune by.
 * 3. Write   a row made or replaced, tried again when another tab wrote
 *            first; and, for a store whose rows are written and dropped at
 *            once, each row's writes in turn, a drop waiting for those
 *            under way (`turns.ts`).
 */

export { turns } from './turns.ts';

/** How many times a write is tried again when another tab wrote first. */
export const RETRIES = 5;

const PAGE = 500;

// 1. Key
/** A row's key: its ids, which no id holds a space of, in order. */
export const keyOf = (...ids: ReadonlyArray<string>) => ids.join(' ');

// 2. Scan
/** Every row, read a page at a time, to prune by. */
export const scan = <T, E, R>(
  page: (options: QueryOptions<T>) => Effect.Effect<QueryPage<Entity<T>>, E, R>,
) =>
  Effect.gen(function* () {
    const found: Array<T> = [];
    let options: QueryOptions<T> = { limit: PAGE };
    while (true) {
      const read = yield* page(options);
      found.push(...read.items.map(({ value }) => value));
      const last = read.items.at(-1);
      if (!read.hasMore || last === undefined) return found;
      options = { limit: PAGE, after: last };
    }
  });

// 3. Write
/** Makes the row, or replaces it, tried again when another tab wrote first. */
export const upsert = <T, E, R>({
  get,
  insert,
  update,
}: {
  readonly get: Effect.Effect<Entity<T> | null, E, R>;
  readonly insert: Effect.Effect<unknown, E, R>;
  readonly update: (row: Entity<T>) => Effect.Effect<unknown, E, R>;
}) =>
  Effect.flatMap(get, (row) => (row === null ? insert : update(row))).pipe(
    Effect.retry({ times: RETRIES }),
  );
