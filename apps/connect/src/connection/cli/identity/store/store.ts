import { chmodSync, closeSync, existsSync, openSync } from 'node:fs';
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
 */

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
    const database = yield* Effect.acquireRelease(
      Effect.sync(() => makeNodeSQLite({ path: db })),
      (database) => Effect.sync(() => database.close?.()),
    );
    yield* SQLite.setup(keConnectTable, { database, mode: 'persistent' }).pipe(
      Effect.mapError(
        (cause) => new Error(`${db} cannot be opened: ${cause.message}`),
      ),
    );
    yield* SQLite.setup(deviceAccountsTable, {
      database,
      mode: 'disposable',
    }).pipe(Effect.orDie);
    return {
      /** The `ke-connect` table. */
      table: SQLite.make(keConnectTable, { database }).layer,
      /** auth-toolkit's Sign-in table, for its Device's `storage`. */
      signIn: SQLite.make(deviceAccountsTable, { database }).layer,
    };
  });

export type Store = Effect.Success<ReturnType<typeof openStore>>;
