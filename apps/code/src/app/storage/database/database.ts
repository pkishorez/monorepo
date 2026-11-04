import { Effect, type Layer } from 'effect';
import type { Entity } from '@kestack/std-toolkit/core';
import type { QueryOptions, QueryPage } from '@kestack/std-toolkit/db';

/*
 * The databases this device keeps, and how every store keeps its rows in
 * them, the Preferences, the Connection Filter, the cache, the Unseen
 * marks and the Saved Drafts alike.
 *
 * 1. Name    each database by its place: the device's own, `code:device`;
 *            each Account's, `code:account:<accountId>`; each of its
 *            Connections', under the Account's; and each Connection's
 *            sync Stores, under the Connection's. `IDB.prune` reads a name
 *            as segments split by `:`, so a prune by prefix takes an
 *            Account or a Connection with all under it, and nothing beside.
 * 2. Key     a row's key, made of its ids.
 * 3. Scan    every row, read a page at a time, to prune by.
 * 4. Write   a row made or replaced, tried again when another tab wrote
 *            first; and, for a store whose rows are written and dropped at
 *            once, each row's writes in turn, a drop waiting for those
 *            under way (`turns.ts`); each write heard in every tab, by its
 *            database's doorbell (`doorbell.ts`).
 * 5. Place   one table in many databases, one per Account or Connection, each
 *            made the first time it is asked for.
 * 6. Gone    what the user asked to go, by whose a row is (`gone.ts`).
 */

// 1. Name
/** The database of this device: its Accounts and its Preferences. */
export const device = 'code:device';

/** The prefix of every Account's database, and all under them. */
export const accounts = 'code:account:';

/** The database of one Account. */
export const account = (accountId: string) => `${accounts}${accountId}`;

/** The prefix of every Connection's database of an Account, and all under them. */
export const connections = (accountId: string) =>
  `${account(accountId)}:connection:`;

/** The database of one Connection of an Account. */
export const connection = (accountId: string, connectionId: string) =>
  `${connections(accountId)}${connectionId}`;

/** The prefix of one Connection's sync Stores: a Replica Instance's name follows it. */
export const sync = (accountId: string, connectionId: string) =>
  `${connection(accountId, connectionId)}:sync:`;

export { turns } from './turns.ts';
export { broadcast, type Doorbell } from './doorbell.ts';

/** How many times a write is tried again when another tab wrote first. */
export const RETRIES = 5;

const PAGE = 500;

// 2. Key
/** A row's key: its ids, which no id holds a space of, in order. */
export const keyOf = (...ids: ReadonlyArray<string>) => ids.join(' ');

// 3. Scan
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

// 4. Write
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

// 5. Place
/**
 * The table's Layer in each database, by its name, made once and shared
 * by all who ask, so a table in memory keeps its rows between them.
 */
export const placed = <A>(make: (database: string) => Layer.Layer<A>) => {
  const made = new Map<string, Layer.Layer<A>>();
  return (database: string) => {
    const found = made.get(database);
    if (found !== undefined) return found;
    const layer = make(database);
    made.set(database, layer);
    return layer;
  };
};
