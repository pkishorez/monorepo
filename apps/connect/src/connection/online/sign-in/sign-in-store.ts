import { Effect } from 'effect';
import { deviceAccountsTable } from '@kestack/auth-toolkit/client/device';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';

/** The Sign-in Store on the SQLite file at `db`, open for as long as the Scope. */
export const signInStore = (db: string) =>
  Effect.gen(function* () {
    const database = yield* Effect.acquireRelease(
      Effect.sync(() => makeNodeSQLite({ path: db })),
      (database) => Effect.sync(() => database.close?.()),
    );
    // Remembered sign-ins: losing them costs a sign-in, never data.
    yield* SQLite.setup(deviceAccountsTable, {
      database,
      mode: 'disposable',
    }).pipe(Effect.orDie);
    return SQLite.make(deviceAccountsTable, { database }).layer;
  });
