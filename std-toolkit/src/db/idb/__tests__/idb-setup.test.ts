import 'fake-indexeddb/auto';
import { Effect, Layer, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../eschema/index.js';
import { StdTable } from '../../index.js';
import { IDB } from '../index.js';
import { makeTableContract } from '../table/index.js';

const openDatabase = (factory: IDBFactory, name: string, version?: number) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request =
      version === undefined ? factory.open(name) : factory.open(name, version);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

const requestResult = <A>(request: IDBRequest<A>) =>
  new Promise<A>((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

const isolatedFactory = (factory: IDBFactory): IDBFactory => ({
  open: factory.open.bind(factory),
  deleteDatabase: factory.deleteDatabase.bind(factory),
  databases: factory.databases.bind(factory),
  cmp: factory.cmp.bind(factory),
});

const personSchema = EntityESchema.make('Person', 'personId', {
  email: Schema.String,
}).build();

describe('IndexedDB setup', () => {
  it('shares one database runtime across stores and upgrades missing indexes', async () => {
    const databaseName = `sharing-${crypto.randomUUID()}`;
    const database = IDB.database({ databaseName });
    const sharedDatabase = IDB.database({ databaseName });
    expect(sharedDatabase).toBe(database);
    const people = StdTable.make('people').primary('pk', 'sk').build();
    const orders = StdTable.make('orders').primary('pk', 'sk').build();
    await Promise.all([
      Effect.runPromise(IDB.make(people, { database }).setup),
      Effect.runPromise(IDB.make(orders, { database }).setup),
    ]);
    const upgradedPeople = StdTable.make('people')
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .build();
    await Effect.runPromise(IDB.make(upgradedPeople, { database }).setup);
    const connection = await database.open();
    expect([...connection.objectStoreNames]).toEqual(['orders', 'people']);
    expect(
      connection
        .transaction('people')
        .objectStore('people')
        .indexNames.contains('GSI1'),
    ).toBe(true);
  });

  it('keeps the version stable when setup is unchanged and bumps once for a new index', async () => {
    const database = IDB.database({
      databaseName: `versioning-${crypto.randomUUID()}`,
    });
    const base = StdTable.make('records').primary('pk', 'sk').build();
    await Effect.runPromise(IDB.make(base, { database }).setup);
    const initialVersion = (await database.open()).version;

    await Effect.runPromise(IDB.make(base, { database }).setup);
    expect((await database.open()).version).toBe(initialVersion);

    const indexed = StdTable.make('records')
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .build();
    await Effect.runPromise(IDB.make(indexed, { database }).setup);
    const upgraded = await database.open();
    expect(upgraded.version).toBe(initialVersion + 1);
    expect(
      upgraded
        .transaction('records')
        .objectStore('records')
        .indexNames.contains('GSI1'),
    ).toBe(true);
  });

  it('does not backfill current records when an index is added', async () => {
    const database = IDB.database({
      databaseName: `backfill-${crypto.randomUUID()}`,
    });
    const base = StdTable.make('records').primary('pk', 'sk').build();
    base.entity(personSchema).primary().build();
    await Effect.runPromise(IDB.make(base, { database }).setup);
    const baseRuntime = makeTableContract(database, base, 'records');
    await Effect.runPromise(
      baseRuntime.writeItem({
        item: {
          pk: 'person-1',
          sk: 'record',
          meta: { _e: 'Person', _u: '1', _d: false },
          data: {
            _v: 'v1',
            personId: 'person-1',
            email: 'person@example.com',
          },
          keys: {},
        },
      }),
    );

    const indexed = StdTable.make('records')
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .build();
    indexed
      .entity(personSchema)
      .primary()
      .index('GSI1', 'byEmail', { pk: ['email'] })
      .build();
    await Effect.runPromise(IDB.make(indexed, { database }).setup);

    const connection = await database.open();
    const physical = await requestResult(
      connection
        .transaction('records')
        .objectStore('records')
        .get(['person-1', 'record']),
    );
    expect(physical).not.toHaveProperty('GSI1PK');
    expect(physical).not.toHaveProperty('GSI1SK');
  });

  it('indexes an LSI on the stored partition property for a renamed primary key', async () => {
    const database = IDB.database({
      databaseName: `renamed-primary-${crypto.randomUUID()}`,
    });
    const table = StdTable.make('records')
      .primary('PK', 'SK')
      .lsi('LSI1', 'LSI1SK')
      .build();
    const labelled = EntityESchema.make('Person', 'personId', {
      email: Schema.String,
      label: Schema.String,
    }).build();
    const person = table
      .entity(labelled)
      .primary({ pk: ['email'] })
      .index('LSI1', 'byLabel', { sk: ['label'] })
      .build();
    const configured = IDB.make(table, { database });
    const layer = Layer.unwrap(
      configured.setup.pipe(Effect.as(configured.layer)),
    );
    await Effect.runPromise(configured.setup);

    const connection = await database.open();
    expect(
      connection.transaction('records').objectStore('records').index('LSI1')
        .keyPath,
    ).toEqual(['pk', 'LSI1SK']);

    await Effect.runPromise(
      person
        .insert({
          personId: 'person-1',
          email: 'person@example.com',
          label: 'b',
        })
        .pipe(Effect.provide(layer)),
    );
    const page = await Effect.runPromise(
      person
        .query('byLabel', {
          pk: { email: 'person@example.com' },
          '>': { label: 'a' },
        })
        .pipe(Effect.provide(layer)),
    );

    expect(page.items).toHaveLength(1);
  });

  it('surfaces an unavailable IndexedDB factory', async () => {
    const cause = new Error('IndexedDB is unavailable');
    const indexedDB = {
      open: () => {
        throw cause;
      },
    } as unknown as IDBFactory;
    const database = IDB.database({
      databaseName: `unavailable-${crypto.randomUUID()}`,
      indexedDB,
    });

    const result = await Effect.runPromise(
      database.setup('records', []).pipe(Effect.result),
    );

    expect(result).toMatchObject({ _tag: 'Failure', failure: cause });
  });

  it('retries after a failed open instead of caching the rejection', async () => {
    let attempts = 0;
    const factory = isolatedFactory(indexedDB);
    const flakyFactory = {
      ...factory,
      open: (...arguments_: Parameters<IDBFactory['open']>) => {
        attempts++;
        if (attempts === 1) throw new Error('temporary open failure');
        return arguments_.length === 1
          ? factory.open(arguments_[0])
          : factory.open(arguments_[0], arguments_[1]);
      },
    } as IDBFactory;
    const database = IDB.database({
      databaseName: `retry-${crypto.randomUUID()}`,
      indexedDB: flakyFactory,
    });

    await expect(database.open()).rejects.toThrow('temporary open failure');
    await expect(database.open()).resolves.toBeDefined();
    expect(attempts).toBe(2);
  });

  it('defers the default factory lookup until an operation runs', async () => {
    const factory = globalThis.indexedDB;
    Reflect.deleteProperty(globalThis, 'indexedDB');
    try {
      const database = IDB.database({
        databaseName: `ssr-${crypto.randomUUID()}`,
      });
      const result = await Effect.runPromise(
        database.setup('records', []).pipe(Effect.result),
      );
      expect(result).toMatchObject({
        _tag: 'Failure',
        failure: Error('IndexedDB is not available in this environment'),
      });
    } finally {
      globalThis.indexedDB = factory;
    }
  });

  it('closes a cached connection when another tab changes the version', async () => {
    const databaseName = `versionchange-${crypto.randomUUID()}`;
    const database = IDB.database({ databaseName });
    await Effect.runPromise(database.setup('records', []));
    const initial = await database.open();

    const external = await openDatabase(
      indexedDB,
      databaseName,
      initial.version + 1,
    );

    expect((await database.open()).version).toBe(external.version);
    external.close();
  });

  it('rechecks topology when two tabs race different upgrades', async () => {
    const databaseName = `race-${crypto.randomUUID()}`;
    const firstTab = IDB.database({
      databaseName,
      indexedDB: isolatedFactory(indexedDB),
    });
    const secondTab = IDB.database({
      databaseName,
      indexedDB: isolatedFactory(indexedDB),
    });

    await Promise.all([
      Effect.runPromise(firstTab.setup('people', [])),
      Effect.runPromise(secondTab.setup('orders', [])),
    ]);

    const connection = await firstTab.open();
    expect([...connection.objectStoreNames].sort()).toEqual([
      'orders',
      'people',
    ]);
  });

  it('reopens at the latest version after a competing upgrade wins', async () => {
    const databaseName = `version-error-${crypto.randomUUID()}`;
    const factory = isolatedFactory(indexedDB);
    let raced = false;
    const racingFactory = {
      ...factory,
      open: (...arguments_: Parameters<IDBFactory['open']>) => {
        const [name, version] = arguments_;
        if (version !== undefined && !raced) {
          raced = true;
          const winner = factory.open(name, version + 1);
          winner.onsuccess = () => winner.result.close();
        }
        return version === undefined
          ? factory.open(name)
          : factory.open(name, version);
      },
    } as IDBFactory;
    const database = IDB.database({
      databaseName,
      indexedDB: racingFactory,
    });

    await Effect.runPromise(database.setup('records', []));

    expect(raced).toBe(true);
    expect((await database.open()).objectStoreNames.contains('records')).toBe(
      true,
    );
  });

  it('rejects the internal entity index name', async () => {
    const database = IDB.database({
      databaseName: `reserved-${crypto.randomUUID()}`,
    });
    const result = await Effect.runPromise(
      database
        .setup('records', [{ name: '_entity', keyPath: ['pk', 'sk'] }])
        .pipe(Effect.result),
    );
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: Error('IndexedDB index slot name "_entity" is reserved'),
    });
  });

  it('rejects an existing Store with an incompatible key path', async () => {
    const databaseName = `key-path-${crypto.randomUUID()}`;
    const seeded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('records', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
    });
    seeded.close();
    const table = StdTable.make('records').primary('pk', 'sk').build();
    const database = IDB.database({ databaseName });

    const result = await Effect.runPromise(
      IDB.make(table, { database }).setup.pipe(Effect.result),
    );

    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: Error('IndexedDB Store "records" has an incompatible key path'),
    });
  });

  it('recreates a Sparse index with incompatible options', async () => {
    const databaseName = `unique-index-${crypto.randomUUID()}`;
    const seeded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('records', {
          keyPath: ['pk', 'sk'],
        });
        store.createIndex('_entity', '_e', {
          unique: true,
          multiEntry: true,
        });
      };
      request.onsuccess = () => resolve(request.result);
    });
    seeded.close();
    const table = StdTable.make('records').primary('pk', 'sk').build();
    const database = IDB.database({ databaseName });

    await Effect.runPromise(IDB.make(table, { database }).setup);

    const connection = await database.open();
    const entityIndex = connection
      .transaction('records')
      .objectStore('records')
      .index('_entity');
    expect(entityIndex.unique).toBe(false);
    expect(entityIndex.multiEntry).toBe(false);
  });

  it('rejects an undeclared unique index', async () => {
    const databaseName = `undeclared-unique-${crypto.randomUUID()}`;
    const seeded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('records', {
          keyPath: ['pk', 'sk'],
        });
        store.createIndex('_entity', '_e');
        store.createIndex('externalUnique', 'data.email', { unique: true });
      };
      request.onsuccess = () => resolve(request.result);
    });
    seeded.close();
    const table = StdTable.make('records').primary('pk', 'sk').build();
    const database = IDB.database({ databaseName });

    const result = await Effect.runPromise(
      IDB.make(table, { database }).setup.pipe(Effect.result),
    );

    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: Error(
        'IndexedDB Store "records" has an undeclared unique index "externalUnique"',
      ),
    });
  });

  it('removes matching entity items through the physical entity cursor', async () => {
    const database = IDB.database({
      databaseName: `cursor-${crypto.randomUUID()}`,
    });
    await Effect.runPromise(database.setup('records', []));
    const runtime = makeTableContract(
      database,
      { localSecondaryIndexes: {}, globalSecondaryIndexes: {} },
      'records',
    );
    const item = (pk: string, entity: string) => ({
      pk,
      sk: 'record',
      meta: { _e: entity, _u: '1', _d: false },
      data: { _v: '1' },
      keys: {},
    });
    await Effect.runPromise(
      Effect.all([
        runtime.writeItem({ item: item('one', 'person') }),
        runtime.writeItem({ item: item('two', 'person') }),
        runtime.writeItem({ item: item('three', 'order') }),
      ]),
    );

    const connection = await database.open();
    const physical = await requestResult(
      connection
        .transaction('records')
        .objectStore('records')
        .get(['one', 'record']),
    );
    expect(physical).toEqual({
      pk: 'one',
      sk: 'record',
      _e: 'person',
      _v: '1',
      _u: '1',
      _d: false,
      data: { _v: '1' },
    });

    expect(
      await Effect.runPromise(runtime.hardDeleteEntityItems('person')),
    ).toBe(2);
    expect(
      await Effect.runPromise(runtime.getItem({ pk: 'one', sk: 'record' })),
    ).toBeNull();
    expect(
      await Effect.runPromise(runtime.getItem({ pk: 'two', sk: 'record' })),
    ).toBeNull();
    expect(
      await Effect.runPromise(runtime.getItem({ pk: 'three', sk: 'record' })),
    ).not.toBeNull();
  });
});
