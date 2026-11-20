import {
  chmodSync,
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Effect, Schema } from 'effect';
import { ESchema } from '@kestack/std-toolkit/eschema';
import {
  authWorker,
  connection,
  type KeptConnection,
  openStore,
} from '../../store/index.js';

/*
 * Shipped in ke-connect 0.0.7. Before it, a Connection kept four files
 * where it now keeps ke-connect.db:
 *
 * - connection.json: the Connection, at v1 (with the key it once kept) or v2.
 * - auth.json: the Auth Worker Connect Cloud last named.
 * - connect.db: the Sign-in, in auth-toolkit's table, the only one in it.
 * - wanted.json: the Releases 0.0.5 last ran; nothing reads it now.
 *
 * When ke-connect.db is not there, it is made under a temporary name: a
 * copy of connect.db by `VACUUM INTO`, which SQLite writes whole and
 * consistent, so the Sign-in moves without being read, then the Connection
 * and the Auth Worker from the two JSON files. Only the finished file is
 * renamed to ke-connect.db, so a stop at any point leaves either nothing
 * done, and the next start does it all again, or ke-connect.db whole. Then
 * the old files go, every time, so a stop before they went is finished
 * next start. A file not there, or unreadable, moves nothing: a missing
 * Sign-in costs a sign-in, a missing Connection a new one.
 *
 * Delete this folder, and its line in ../index.ts, once `ke-connect` no
 * longer supports upgrading from before 0.0.7.
 */

/** connection.json as it was written, copied in so nothing changes it. */
const OldConnection = ESchema.make('ConnectionRecord', {
  id: Schema.String,
  name: Schema.String,
  key: Schema.String,
  owner: Schema.Struct({ id: Schema.String, email: Schema.String }),
  cloud: Schema.String,
  startedAt: Schema.Finite,
})
  .evolve('v2', { key: null }, ({ key: _, ...v1 }) => v1)
  .build();

/** auth.json as it was written. */
const OldAuthInfo = Schema.Struct({ cloud: Schema.String, url: Schema.String });

const readConnection = Schema.decodeUnknownSync(
  Schema.fromJsonString(OldConnection.schema),
);
const readAuthInfo = Schema.decodeUnknownSync(
  Schema.fromJsonString(OldAuthInfo),
);

/** Every file this migration leaves behind it. */
const OLD = [
  'connection.json',
  'auth.json',
  'connect.db',
  'connect.db-journal',
  'connect.db-wal',
  'connect.db-shm',
  'wanted.json',
] as const;

/** What `file` holds, read by `read`; null when it is not there or cannot be read, with a warning. */
const readOld = <A>(file: string, read: (text: string) => A) =>
  Effect.try(() =>
    existsSync(file) ? read(readFileSync(file, 'utf8')) : null,
  ).pipe(
    Effect.catch((error) =>
      Effect.as(
        Effect.logWarning(`Could not read ${file}; it is not moved`, error),
        null,
      ),
    ),
  );

/** Deletes `file` and the journal SQLite may have left beside it. */
const removeDatabase = (file: string) => {
  for (const each of [file, `${file}-journal`, `${file}-wal`, `${file}-shm`])
    rmSync(each, { force: true });
};

/** ke-connect.db at `temporary`, from the old files in `data`. */
const build = (data: string, temporary: string) =>
  Effect.gen(function* () {
    const old = join(data, 'connect.db');
    yield* Effect.sync(() => {
      removeDatabase(temporary);
      // Empty and 0600, which `VACUUM INTO` writes into as it is.
      closeSync(openSync(temporary, 'w', 0o600));
      chmodSync(temporary, 0o600);
    });
    if (existsSync(old))
      yield* Effect.try(() => {
        const database = new DatabaseSync(old);
        try {
          database.prepare('VACUUM INTO ?').run(temporary);
        } finally {
          database.close();
        }
      }).pipe(
        Effect.catch((error) =>
          Effect.logWarning(
            `Could not copy the Sign-in from ${old}; sign in again`,
            error,
          ),
        ),
      );
    const kept: KeptConnection | null = yield* readOld(
      join(data, 'connection.json'),
      readConnection,
    );
    const named = yield* readOld(join(data, 'auth.json'), readAuthInfo);
    yield* Effect.scoped(
      Effect.gen(function* () {
        const store = yield* openStore(temporary);
        if (kept !== null)
          yield* connection
            .put({ connection: kept })
            .pipe(Effect.provide(store.table));
        if (named !== null)
          yield* authWorker
            .put({ authWorker: named })
            .pipe(Effect.provide(store.table));
      }),
    );
  });

/** Moves the old files in `data`, if any, into ke-connect.db, then deletes them. */
export const oneDatabase = (data: string) =>
  Effect.gen(function* () {
    if (!existsSync(data)) return;
    const target = join(data, 'ke-connect.db');
    const old = OLD.filter((name) => existsSync(join(data, name)));
    if (old.length === 0) return;
    if (!existsSync(target)) {
      const temporary = `${target}.tmp`;
      yield* build(data, temporary);
      yield* Effect.sync(() => renameSync(temporary, target));
      yield* Effect.log(`Moved ${old.join(', ')} into ke-connect.db`);
    }
    yield* Effect.sync(() => {
      for (const name of OLD) rmSync(join(data, name), { force: true });
    });
  }).pipe(
    Effect.mapError(
      (cause) =>
        new Error(`Could not move ${data} into ke-connect.db`, { cause }),
    ),
  );
