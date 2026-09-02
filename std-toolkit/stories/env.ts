// The one hidden helper behind the chapters. It supplies environments only,
// never std-toolkit API: every call a chapter teaches is written inline in
// that chapter's proof.
//
// Exports:
//   AdapterName, adapterNames
//     The four databases a chapter can run on: 'memory' | 'sqlite' | 'idb' | 'dynamodb'.
//   fresh(adapter, table)(program)
//     Runs `program` against a brand-new, empty copy of `table` on that adapter,
//     with a sequential Ulid ('000…001', '000…002', …) so ids are predictable,
//     and tears the database down afterwards even if the program fails.
//     DynamoDB reaches DYNAMODB_LOCAL_ENDPOINT (default http://localhost:8090).
//   platform(options?)
//     An in-process StdSyncPlatform for Act V: an in-memory sync store (or a
//     fake-IndexedDB one with `store: 'idb'`; two calls sharing a `databaseName`
//     share one durable store, like two tabs of one browser), in-memory
//     leadership, and — with `peerSync: true` — a BroadcastChannel peer link.
//   connectivity()
//     A hand-driven Connectivity for the offline chapter: `offline` and
//     `online` flip it and notify subscribers.

import 'fake-indexeddb/auto';
import { Effect, Layer, Match } from 'effect';
import { IDBFactory } from 'fake-indexeddb';
import { Ulid } from 'std-toolkit/core';
import type { TableDefinition } from 'std-toolkit/db';
import { DynamoDB } from 'std-toolkit/db/dynamodb';
import { IDB } from 'std-toolkit/db/idb';
import { Memory } from 'std-toolkit/db/memory';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import {
  syncStore,
  type Connectivity,
  type StdSyncPlatform,
} from 'std-toolkit/sync';
import { inMemoryLeadership } from 'std-toolkit/sync/leadership/in-memory';
import { broadcastChannel } from 'std-toolkit/sync/platform/browser';

export type AdapterName = 'memory' | 'sqlite' | 'idb' | 'dynamodb';

// What every adapter's `make` reads from a table; accepts a table of any index shape.
type TableSource<Name extends string> = Pick<
  TableDefinition<Name>,
  | 'logicalName'
  | 'primary'
  | 'localSecondaryIndexes'
  | 'globalSecondaryIndexes'
  | 'snapshot'
>;

export const adapterNames: readonly AdapterName[] = [
  'memory',
  'sqlite',
  'idb',
  'dynamodb',
];

const dynamodbEndpoint =
  process.env.DYNAMODB_LOCAL_ENDPOINT ?? 'http://localhost:8090';

let sessionNumber = 0;
const uniqueName = (logicalName: string) =>
  `${logicalName}-${process.pid}-${++sessionNumber}`;

const sequentialUlid = () => {
  let issued = 0;
  return () => String(++issued).padStart(26, '0');
};

const deleteIDBDatabase = (
  indexedDB: IDBFactory,
  databaseName: string,
  database: ReturnType<typeof IDB.database>,
) =>
  Effect.promise(async () => {
    (await database.open()).close();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });

const onMemory =
  <Name extends string>(table: TableSource<Name>) =>
  <A, E, R>(program: Effect.Effect<A, E, R>) =>
    // Built lazily so every RUN of a proof gets its own empty store and fresh
    // Ulid counter, not one shared by all runs of the same question.
    Effect.suspend(() =>
      program.pipe(
        Effect.provide(Memory.make(table).layer),
        Effect.provideService(Ulid, sequentialUlid()),
      ),
    );

const onSQLite =
  <Name extends string>(table: TableSource<Name>) =>
  <A, E, R>(program: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const database = makeNodeSQLite({ path: ':memory:' });
      const configured = SQLite.make(table, { database });
      yield* configured.setup;
      return yield* program.pipe(
        Effect.provide(configured.layer),
        Effect.provideService(Ulid, sequentialUlid()),
        Effect.ensuring(Effect.sync(() => database.close?.())),
      );
    });

const onIDB =
  <Name extends string>(table: TableSource<Name>) =>
  <A, E, R>(program: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const indexedDB = new IDBFactory();
      const databaseName = uniqueName(table.logicalName);
      const database = IDB.database({ databaseName, indexedDB });
      const configured = IDB.make(table, { database });
      yield* configured.setup;
      return yield* program.pipe(
        Effect.provide(configured.layer),
        Effect.provideService(Ulid, sequentialUlid()),
        Effect.ensuring(deleteIDBDatabase(indexedDB, databaseName, database)),
      );
    });

const onDynamoDB =
  <Name extends string>(table: TableSource<Name>) =>
  <A, E, R>(program: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const configured = DynamoDB.make(table, {
        tableName: uniqueName(table.logicalName),
        region: 'local',
        endpoint: dynamodbEndpoint,
        credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
      });
      yield* configured.setup;
      return yield* program.pipe(
        Effect.provide(configured.layer),
        Effect.provideService(Ulid, sequentialUlid()),
        Effect.ensuring(Effect.orDie(configured.teardown)),
      );
    });

export const fresh = <Name extends string>(
  adapter: AdapterName,
  table: TableSource<Name>,
) =>
  Match.value(adapter).pipe(
    Match.when('memory', () => onMemory(table)),
    Match.when('sqlite', () => onSQLite(table)),
    Match.when('idb', () => onIDB(table)),
    Match.when('dynamodb', () => onDynamoDB(table)),
    Match.exhaustive,
  );

const sharedIndexedDB = new Map<string, IDBFactory>();

const idbStoreLayer = (databaseName: string) => {
  const indexedDB =
    sharedIndexedDB.get(databaseName) ??
    sharedIndexedDB.set(databaseName, new IDBFactory()).get(databaseName)!;
  const store = IDB.make(syncStore, {
    database: IDB.database({ databaseName, indexedDB }),
  });
  return Layer.unwrap(Effect.orDie(Effect.as(store.setup, store.layer)));
};

export const platform = (options?: {
  readonly peerSync?: boolean;
  readonly store?: 'memory' | 'idb';
  readonly databaseName?: string;
}): StdSyncPlatform => {
  const storeLayer =
    options?.store === 'idb'
      ? idbStoreLayer(options.databaseName ?? uniqueName('std-sync'))
      : Memory.make(syncStore).layer;
  const channel = options?.peerSync ? broadcastChannel() : null;
  return {
    storeLayer,
    leadershipLayer: inMemoryLeadership(),
    ...(channel ? { peerSync: { channel } } : {}),
  };
};

export const connectivity = (): {
  readonly connectivity: Connectivity;
  readonly offline: Effect.Effect<void>;
  readonly online: Effect.Effect<void>;
} => {
  let isOnline = true;
  const listeners = new Set<() => void>();
  const set = (next: boolean) =>
    Effect.sync(() => {
      isOnline = next;
      for (const listener of listeners) listener();
    });
  return {
    connectivity: {
      isOnline: () => isOnline,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    offline: set(false),
    online: set(true),
  };
};
