import { chmodSync, closeSync, existsSync, openSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Effect } from 'effect';
import { deviceAccountsTable } from '@kestack/auth-toolkit/client/device';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { keConnectTable } from './table.js';

/*
 * ke-connect.db, the one file a Connection keeps, 0600 from the moment it is
 * made, with two tables:
 *
 * - `ke-connect` (table.ts), persistent: the Connection and the Auth Worker
 *   Connect Cloud last named.
 * - `auth-device-accounts`, auth-toolkit's own, disposable: the Sign-in. A
 *   change auth-toolkit makes to it costs a sign-in, never the Connection.
 *
 * Each table keeps its own snapshot, so a wipe of one never touches the
 * other. A folder from before this file is moved into it by ../migrations/,
 * which `serve` and `remove` run while no other `ke-connect` uses the folder.
 * `list` reads it with `readStore`, which never sets it up, while `serve`
 * may be using it.
 */

/** How long a call waits for another `ke-connect` holding the file to let go, before SQLite fails it as busy. */
const BUSY_TIMEOUT = 5_000;

/** Makes `db` 0600 before SQLite opens it, so the Sign-in is never in a file others may read. */
const ownFile = (db: string) =>
  Effect.sync(() => {
    if (!existsSync(db)) closeSync(openSync(db, 'a', 0o600));
    chmodSync(db, 0o600);
  });

/** ke-connect.db at `db`, made if it is not there, open for as long as the Scope. */
export const openStore = (db: string) =>
  Effect.gen(function* () {
    yield* ownFile(db);
    const file = yield* Effect.acquireRelease(
      Effect.sync(() => new DatabaseSync(db, { timeout: BUSY_TIMEOUT })),
      (file) => Effect.sync(() => file.close()),
    );
    const database = makeNodeSQLite({ database: file });
    yield* SQLite.setup(keConnectTable, { database, mode: 'persistent' }).pipe(
      Effect.mapError(
        (cause) => new Error(`${db} cannot be opened: ${cause.message}`),
      ),
    );
    yield* SQLite.setup(deviceAccountsTable, {
      database,
      mode: 'disposable',
    }).pipe(
      Effect.mapError(
        (cause) => new Error(`${db} cannot keep a Sign-in: ${cause.message}`),
      ),
    );
    return {
      /** The `ke-connect` table. */
      table: SQLite.make(keConnectTable, { database }).layer,
      /** auth-toolkit's Sign-in table, for its Device's `storage`. */
      signIn: SQLite.make(deviceAccountsTable, { database }).layer,
    };
  });

export type Store = Effect.Success<ReturnType<typeof openStore>>;

/**
 * The `ke-connect` table in the ke-connect.db at `db`, opened read-only and
 * never set up, for as long as the Scope: a reader beside a running `serve`
 * changes nothing in its file.
 */
export const readStore = (db: string) =>
  Effect.map(
    Effect.acquireRelease(
      Effect.try({
        try: () =>
          new DatabaseSync(db, { readOnly: true, timeout: BUSY_TIMEOUT }),
        catch: (cause) => new Error(`${db} cannot be read`, { cause }),
      }),
      (file) => Effect.sync(() => file.close()),
    ),
    (file) =>
      SQLite.make(keConnectTable, {
        database: makeNodeSQLite({ database: file }),
      }).layer,
  );
