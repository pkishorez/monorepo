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
//     An in-process StdSyncPlatform for Act V, private to one tab: an
//     in-memory sync store (or a fake-IndexedDB one with `store: 'idb'`; two
//     calls sharing a `databaseName` share one durable store), and no
//     Leadership or Doorbell.
//   browserTabs(options?)
//     A browser in one process: every `tab()` it returns shares one sync store,
//     one Leadership (one lock per key), and one Doorbell, like tabs of one
//     browser. `store: 'idb'` makes the shared store fake-IndexedDB.

import 'fake-indexeddb/auto';
import { Cause, Effect, Match, Queue, Semaphore, Stream } from 'effect';
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
  type Doorbell,
  type Leadership,
  type StdSyncPlatform,
} from 'std-toolkit/sync';

export type AdapterName = 'memory' | 'sqlite' | 'idb' | 'dynamodb';

// What every adapter's `make` reads from a table; accepts a table of any index shape.
type TableSource<Name extends string> = Pick<
  TableDefinition<Name>,
  'logicalName' | 'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
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
      yield* Effect.orDie(SQLite.setup(table, { database }));
      return yield* program.pipe(
        Effect.provide(SQLite.make(table, { database }).layer),
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
      return yield* program.pipe(
        Effect.provide(IDB.make(table, { database }).layer),
        Effect.provideService(Ulid, sequentialUlid()),
        Effect.ensuring(deleteIDBDatabase(indexedDB, databaseName, database)),
      );
    });

const onDynamoDB =
  <Name extends string>(table: TableSource<Name>) =>
  <A, E, R>(program: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const config = {
        tableName: uniqueName(table.logicalName),
        region: 'local',
        endpoint: dynamodbEndpoint,
        credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
      };
      yield* Effect.orDie(DynamoDB.createTable(table, config));
      return yield* program.pipe(
        Effect.provide(DynamoDB.make(table, config).layer),
        Effect.provideService(Ulid, sequentialUlid()),
        Effect.ensuring(Effect.orDie(DynamoDB.deleteTable(config))),
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
  return IDB.make(syncStore, {
    database: IDB.database({ databaseName, indexedDB }),
  }).layer;
};

export const platform = (options?: {
  readonly store?: 'memory' | 'idb';
  readonly databaseName?: string;
}): StdSyncPlatform => {
  const store =
    options?.store === 'idb'
      ? idbStoreLayer(options.databaseName ?? uniqueName('std-sync'))
      : Memory.make(syncStore).layer;
  return {
    store: () => store,
    leadership: { run: (_key, effect) => effect },
    doorbell: { ring: () => Effect.void, listen: () => Stream.never },
  };
};

export const browserTabs = (options?: {
  readonly store?: 'memory' | 'idb';
}): { readonly tab: () => StdSyncPlatform } => {
  const store =
    options?.store === 'idb'
      ? idbStoreLayer(uniqueName('std-sync'))
      : Memory.make(syncStore).layer;
  const locks = new Map<string, Semaphore.Semaphore>();
  const leadership: Leadership = {
    run: (key, effect) => {
      const lock = locks.get(key) ?? Semaphore.makeUnsafe(1);
      locks.set(key, lock);
      return lock.withPermit(effect);
    },
  };
  const rooms = new Map<string, Set<Queue.Queue<void, Cause.Done>>>();
  const doorbell: Doorbell = {
    ring: (topic) =>
      Effect.sync(() => {
        for (const queue of rooms.get(topic) ?? [])
          Queue.offerUnsafe(queue, undefined);
      }),
    listen: (topic) =>
      Stream.callback<void>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const room = rooms.get(topic) ?? new Set();
            rooms.set(topic, room);
            room.add(queue);
          }),
          () => Effect.sync(() => rooms.get(topic)?.delete(queue)),
        ),
      ),
  };
  return { tab: () => ({ store: () => store, leadership, doorbell }) };
};
