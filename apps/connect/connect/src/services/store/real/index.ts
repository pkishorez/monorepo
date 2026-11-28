import { randomUUID } from 'node:crypto';
import { chmodSync, closeSync, existsSync, openSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Effect, Layer } from 'effect';
import { deviceAccountsTable } from '@kestack/auth-toolkit/client/device';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import {
  ConnectionOfAnotherCloud,
  ConnectionOwnedByAnother,
  type KeptConnection,
  Store,
  StoreFailed,
} from '../contract/index.js';
import { backUp } from './backup.js';
import { authWorker, connection, keConnectTable } from './table.js';

export { backupName } from './backup.js';
export { keConnectTable } from './table.js';

const BUSY_TIMEOUT = 5_000;

const failed = (what: string) => (cause: unknown) =>
  new StoreFailed({
    message: `${what}: ${cause instanceof Error ? cause.message : String(cause)}`,
  });

const ownFile = (db: string) =>
  Effect.try({
    try: () => {
      if (!existsSync(db)) closeSync(openSync(db, 'a', 0o600));
      chmodSync(db, 0o600);
    },
    catch: failed(`${db} cannot be made`),
  });

const open = (options: StoreOptions) =>
  Effect.gen(function* () {
    const backup = yield* Effect.try({
      try: () => backUp(options.db, options.backups, options.version),
      catch: failed(`${options.db} cannot be backed up`),
    });
    if (backup !== null)
      yield* Effect.log(`Backed up ke-connect.db to ${backup}`);
    yield* ownFile(options.db);
    const file = yield* Effect.acquireRelease(
      Effect.sync(
        () => new DatabaseSync(options.db, { timeout: BUSY_TIMEOUT }),
      ),
      (opened) => Effect.sync(() => opened.close()),
    );
    const database = makeNodeSQLite({ database: file });
    yield* SQLite.setup(keConnectTable, { database, mode: 'persistent' }).pipe(
      Effect.mapError(failed(`${options.db} cannot be opened`)),
    );
    yield* SQLite.setup(deviceAccountsTable, {
      database,
      mode: 'disposable',
    }).pipe(Effect.mapError(failed(`${options.db} cannot keep a Sign-in`)));
    return {
      table: SQLite.make(keConnectTable, { database }).layer,
      signInTable: SQLite.make(deviceAccountsTable, { database }).layer,
    };
  });

const shortHost = (name: string, host: string, short: string) =>
  host === short ? name : name.replaceAll(host, short);

export const layer = (
  options: StoreOptions & { readonly host: string; readonly shortHost: string },
) =>
  Layer.effect(
    Store,
    Effect.map(open(options), ({ table, signInTable }) => {
      const kept = connection.get().pipe(
        Effect.map(({ value }) => value.connection),
        Effect.provide(table),
        Effect.mapError(failed('The Connection cannot be read')),
      );
      const keep = (value: KeptConnection | null) =>
        connection
          .put({ connection: value })
          .pipe(
            Effect.provide(table),
            Effect.asVoid,
            Effect.mapError(failed('The Connection cannot be kept')),
          );
      return Store.of({
        connection: kept,
        claim: ({ owner, cloud, name, startedAt }) =>
          Effect.gen(function* () {
            const found = yield* kept;
            if (found !== null && found.cloud !== cloud)
              return yield* new ConnectionOfAnotherCloud({
                cloud: found.cloud,
                asked: cloud,
              });
            if (found !== null && found.owner.id !== owner.id)
              return yield* new ConnectionOwnedByAnother({
                owner: found.owner.email,
                user: owner.email,
              });
            const claimed: KeptConnection =
              found === null
                ? {
                    id: randomUUID(),
                    name: name.slice(0, 64),
                    owner,
                    cloud,
                    startedAt,
                  }
                : {
                    ...found,
                    name: shortHost(
                      found.name,
                      options.host,
                      options.shortHost,
                    ).slice(0, 64),
                    startedAt,
                  };
            yield* keep(claimed);
            return { id: claimed.id, name: claimed.name };
          }),
        forget: keep(null),
        authWorker: (cloud) =>
          authWorker.get().pipe(
            Effect.map(({ value }) =>
              value.authWorker?.cloud === cloud ? value.authWorker : null,
            ),
            Effect.provide(table),
            Effect.mapError(failed('The Auth Worker cannot be read')),
          ),
        keepAuthWorker: (worker) =>
          authWorker
            .put({ authWorker: worker })
            .pipe(
              Effect.provide(table),
              Effect.asVoid,
              Effect.mapError(failed('The Auth Worker cannot be kept')),
            ),
        signInTable,
      });
    }),
  );

export const readConnection = (db: string) =>
  existsSync(db)
    ? Effect.scoped(
        Effect.gen(function* () {
          const file = yield* Effect.acquireRelease(
            Effect.try({
              try: () =>
                new DatabaseSync(db, { readOnly: true, timeout: BUSY_TIMEOUT }),
              catch: failed(`${db} cannot be read`),
            }),
            (opened) => Effect.sync(() => opened.close()),
          );
          const table = SQLite.make(keConnectTable, {
            database: makeNodeSQLite({ database: file }),
          }).layer;
          return yield* connection.get().pipe(
            Effect.map(({ value }) => value.connection),
            Effect.provide(table),
            Effect.mapError(failed(`${db} cannot be read`)),
          );
        }),
      )
    : Effect.succeed(null);

export interface StoreOptions {
  readonly db: string;
  readonly backups: string;
  readonly version: string;
}
