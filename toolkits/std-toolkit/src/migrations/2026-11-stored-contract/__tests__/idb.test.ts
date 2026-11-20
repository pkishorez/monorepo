import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { Effect, Exit, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../eschema/index.js';
import { StdTable } from '../../../db/index.js';
import { IDB, type TableMode } from '../../../db/idb/index.js';
import { makeTableContract } from '../../../db/idb/table/index.js';
import { contractLayer } from '../../../db/std-table/contract/index.js';
import {
  decodeStoredSnapshot,
  readStoredSnapshot,
} from '../../../db/table-snapshot/index.js';
import { LEGACY_CONTRACT_STORE } from '../legacy.js';

const TaskV1 = EntityESchema.make('Task', 'taskId', {
  title: Schema.String,
}).build();

const tasks = () => {
  const table = StdTable.make('tasks')
    .primary('pk', 'sk')
    .gsi('GSI1', 'GSI1PK', 'GSI1SK')
    .build();
  return { table, task: table.entity(TaskV1).primary().build() };
};

const connect = (factory: IDBFactory) =>
  IDB.database({ databaseName: 'app', indexedDB: factory });

/**
 * A database as the earlier release left it: the table's store and its
 * indexes, a row, and the `_std_contract` store holding the store's record.
 */
const oldDatabase = async (factory: IDBFactory, mode: TableMode) => {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open('app', 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('tasks', {
        keyPath: ['pk', 'sk'],
      });
      store.createIndex('_entity', '_e');
      store.createIndex('GSI1', ['GSI1PK', 'GSI1SK']);
      request.result
        .createObjectStore(LEGACY_CONTRACT_STORE, { keyPath: 'store' })
        .put({ store: 'tasks', mode, hash: 'old-hash', snapshot: {} });
    };
    request.onsuccess = () => resolve(request.result);
  });
  database.close();
  // The row is written straight to the store: no setup runs.
  const { table, task } = tasks();
  await Effect.runPromise(
    task
      .insert({ taskId: 't1', title: 'Write' })
      .pipe(
        Effect.provide(
          contractLayer(
            'tasks',
            makeTableContract(connect(factory), table, 'tasks'),
          ),
        ),
      ),
  );
};

const setup = (factory: IDBFactory, mode: TableMode, storeName?: string) =>
  Effect.runPromise(
    Effect.exit(
      IDB.setup(tasks().table, {
        database: connect(factory),
        mode,
        ...(storeName === undefined ? {} : { storeName }),
      }),
    ),
  );

const storeNames = async (factory: IDBFactory) => [
  ...(await connect(factory).open()).objectStoreNames,
];

const titles = (factory: IDBFactory, mode: TableMode) => {
  const { table, task } = tasks();
  return Effect.runPromise(
    task.get({ taskId: 't1' }).pipe(
      Effect.map((found) => (found === null ? [] : [found.value.title])),
      Effect.provide(
        IDB.make(table, { database: connect(factory), mode }).layer,
      ),
    ),
  );
};

const storedMode = (factory: IDBFactory) =>
  Effect.runPromise(
    readStoredSnapshot(
      makeTableContract(
        connect(factory),
        { localSecondaryIndexes: {}, globalSecondaryIndexes: {} },
        'tasks',
      ),
    ).pipe(
      Effect.flatMap(decodeStoredSnapshot),
      Effect.map((values) => values?.snapshot.mode),
    ),
  );

const failure = (exit: Exit.Exit<void, unknown>) =>
  Exit.isFailure(exit)
    ? exit.cause.reasons.find((reason) => reason._tag === 'Fail')?.error
    : undefined;

describe('the 2026-11 stored-contract migration on IndexedDB', () => {
  it('deletes _std_contract, and a disposable store with rows but no snapshot is wiped', async () => {
    const factory = new IDBFactory();
    await oldDatabase(factory, 'disposable');

    expect(Exit.isSuccess(await setup(factory, 'disposable'))).toBe(true);

    expect(await storeNames(factory)).toEqual(['tasks']);
    expect(await titles(factory, 'disposable')).toEqual([]);
    expect(await storedMode(factory)).toBe('disposable');
  });

  it('deletes _std_contract, and a persistent store keeps its rows under the code', async () => {
    const factory = new IDBFactory();
    await oldDatabase(factory, 'persistent');

    expect(Exit.isSuccess(await setup(factory, 'persistent'))).toBe(true);

    expect(await storeNames(factory)).toEqual(['tasks']);
    expect(await titles(factory, 'persistent')).toEqual(['Write']);
    expect(await storedMode(factory)).toBe('persistent');
  });

  it('bumps the version only while _std_contract is there', async () => {
    const factory = new IDBFactory();
    await oldDatabase(factory, 'disposable');
    await setup(factory, 'disposable');
    const version = (await connect(factory).open()).version;

    await setup(factory, 'disposable');
    expect((await connect(factory).open()).version).toBe(version);
  });

  it('reserves the name of the retired contract store', async () => {
    const factory = new IDBFactory();

    const exit = await setup(factory, 'disposable', LEGACY_CONTRACT_STORE);

    expect(failure(exit)).toMatchObject({
      cause: { message: expect.stringMatching(/"_std_contract" is reserved/) },
    });
    expect(await storeNames(factory)).toEqual([]);
  });
});
