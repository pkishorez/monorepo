import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { Effect, Exit, Schema } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntityESchema } from '../../../eschema/index.js';
import { StdTable } from '../../index.js';
import {
  IDB,
  SetupRefused,
  type IDBTableSource,
  type TableMode,
} from '../index.js';

const TaskV1 = EntityESchema.make('Task', 'taskId', {
  title: Schema.String,
}).build();
// Editing a shipped version is breaking: rows stored under it may not read.
const TaskEdited = EntityESchema.make('Task', 'taskId', {
  title: Schema.String.check(Schema.isMaxLength(3)),
}).build();
// v2 is a gap: no v1 row knows its owner.
const TaskV2 = EntityESchema.make('Task', 'taskId', {
  title: Schema.String,
})
  .evolve('v2', { owner: Schema.String })
  .build();

const makeTable = () => StdTable.make('tasks').primary('pk', 'sk');
const withIndex = () => makeTable().gsi('GSI1', 'GSI1PK', 'GSI1SK');

const tasks = (schema = TaskV1) =>
  makeTable()
    .entity(schema, (e) => e.primary())
    .build();

const byTitle = { pk: ['title'], sk: ['taskId'] } as const;

// The same table with a new index, and the Backfill it needs.
const indexedTasks = () =>
  withIndex()
    .entity(TaskV1, (e) => e.primary().index('GSI1', 'byTitle', byTitle))
    .backfill('task-by-title', { reindex: 'Task' })
    .build();

// The new index with no Backfill: stored rows would be missing from it.
const indexedWithoutBackfill = () =>
  withIndex()
    .entity(TaskV1, (e) => e.primary().index('GSI1', 'byTitle', byTitle))
    .build();

const ownedTasks = (owners: string[]) =>
  makeTable()
    .entity(TaskV2, (e) => e.primary())
    .backfill('task-owner', {
      entity: 'Task',
      to: 'v2',
      run: (task) => {
        owners.push(task.taskId);
        return Effect.succeed({ ...task, owner: 'ann' });
      },
    })
    .build();

type AnyTable = IDBTableSource<'tasks'>;

const connect = (factory: IDBFactory) =>
  IDB.database({ databaseName: 'app', indexedDB: factory });

const setup = (factory: IDBFactory, table: AnyTable, mode: TableMode) =>
  Effect.runPromise(
    Effect.exit(IDB.setup(table, { database: connect(factory), mode })),
  );

const layer = (factory: IDBFactory, table: AnyTable, mode: TableMode) =>
  IDB.make(table, { database: connect(factory), mode }).layer;

const insertTask = (
  factory: IDBFactory,
  table: ReturnType<typeof tasks>,
  mode: TableMode,
  taskId = 't1',
) =>
  Effect.runPromise(
    table.Task.insert({ taskId, title: 'Write' }).pipe(
      Effect.provide(layer(factory, table, mode)),
    ),
  );

const titles = (
  factory: IDBFactory,
  table: ReturnType<typeof tasks>,
  mode: TableMode,
) =>
  Effect.runPromise(
    table.Task.get({ taskId: 't1' }).pipe(
      Effect.map((found) => (found === null ? [] : [found.value.title])),
      Effect.provide(layer(factory, table, mode)),
    ),
  );

const findByTitle = (
  factory: IDBFactory,
  table: ReturnType<typeof indexedTasks>,
) =>
  Effect.runPromise(
    table.Task.query('byTitle', {
      pk: { title: 'Write' },
      '>': { taskId: '' },
    }).pipe(
      Effect.map(({ items }) => items.map(({ value }) => value.taskId)),
      Effect.provide(layer(factory, table, 'persistent')),
    ),
  );

// A raw look at the database, closed at once so it blocks no upgrade.
const inspect = <A>(
  factory: IDBFactory,
  look: (database: IDBDatabase) => A | Promise<A>,
) =>
  new Promise<A>((resolve, reject) => {
    const request = factory.open('app');
    request.onerror = () => reject(request.error);
    request.onsuccess = async () => {
      const database = request.result;
      try {
        resolve(await look(database));
      } catch (cause) {
        reject(cause);
      } finally {
        database.close();
      }
    };
  });

const requested = <A>(request: IDBRequest<A>) =>
  new Promise<A>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const versionOf = (factory: IDBFactory) =>
  inspect(factory, (database) => database.version);

const indexNames = (factory: IDBFactory) =>
  inspect(factory, (database) => [
    ...database.transaction('tasks').objectStore('tasks').indexNames,
  ]);

/** Every record an app wrote, contract rows left out. */
const appRecords = (factory: IDBFactory) =>
  inspect(factory, async (database) => {
    const all = (await requested(
      database.transaction('tasks').objectStore('tasks').getAll(),
    )) as { readonly _e: string }[];
    return all.filter(({ _e }) => _e === 'Task');
  });

// A database another version of the toolkit wrote: a store holding a row,
// and the retired `_std_contract` store beside it.
const seedWithoutContract = (factory: IDBFactory) =>
  new Promise<void>((resolve, reject) => {
    const request = factory.open('app', 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('tasks', {
        keyPath: ['pk', 'sk'],
      });
      store.createIndex('_entity', '_e');
      store.put({
        pk: 'Task#t1',
        sk: 'Task',
        _e: 'Task',
        _u: '1',
        _d: false,
        _v: 'v1',
        data: { _v: 'v1', taskId: 't1', title: 'Write' },
      });
      request.result
        .createObjectStore('_std_contract', { keyPath: 'store' })
        .put({ store: 'tasks', mode: 'persistent', hash: 'old' });
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });

const refusal = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit)
    ? (exit.cause.reasons.find((reason) => reason._tag === 'Fail')
        ?.error as SetupRefused)
    : undefined;

const outcome = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isSuccess(exit) ? exit.value : exit;

describe('IndexedDB setup', () => {
  it('creates a fresh store with its indexes in one version', async () => {
    const factory = new IDBFactory();

    const exit = await setup(factory, indexedTasks(), 'persistent');

    expect(outcome(exit)).toEqual({ kind: 'created' });
    // Version 1 is the empty database the first open makes.
    expect(await versionOf(factory)).toBe(2);
    expect((await indexNames(factory)).sort()).toEqual(['GSI1', '_entity']);
  });

  it('leaves an unchanged store and its version alone', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'persistent');
    const version = await versionOf(factory);

    const exit = await setup(factory, tasks(), 'persistent');

    expect(outcome(exit)).toEqual({ kind: 'unchanged' });
    expect(await versionOf(factory)).toBe(version);
    expect(await titles(factory, tasks(), 'persistent')).toEqual(['Write']);
  });

  it('runs the Backfill for a gap version and keeps it done', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'persistent');
    const owners: string[] = [];

    const exit = await setup(factory, ownedTasks(owners), 'persistent');

    expect(outcome(exit)).toMatchObject({
      kind: 'applied',
      backfills: ['task-owner'],
    });
    expect(owners).toEqual(['t1']);
    const table = ownedTasks(owners);
    const found = await Effect.runPromise(
      table.Task.get({ taskId: 't1' }).pipe(
        Effect.provide(layer(factory, table, 'persistent')),
      ),
    );
    expect(found?.value).toMatchObject({ title: 'Write', owner: 'ann' });
    expect(found?.meta._v).toBe('v2');

    expect(
      outcome(await setup(factory, ownedTasks(owners), 'persistent')),
    ).toEqual({ kind: 'unchanged' });
    expect(owners).toEqual(['t1']);
  });

  it('adds an index in an upgrade and reindexes old rows into it', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'persistent');
    const version = await versionOf(factory);

    const exit = await setup(factory, indexedTasks(), 'persistent');

    expect(outcome(exit)).toMatchObject({
      kind: 'applied',
      backfills: ['task-by-title'],
    });
    expect(await versionOf(factory)).toBe(version + 1);
    expect(await findByTitle(factory, indexedTasks())).toEqual(['t1']);
  });

  it('deletes an index the table no longer declares', async () => {
    const factory = new IDBFactory();
    await setup(factory, indexedTasks(), 'disposable');

    await setup(factory, tasks(), 'disposable');

    expect(await indexNames(factory)).toEqual(['_entity']);
  });
});

describe('a persistent IndexedDB store', () => {
  it('refuses a breaking change and changes nothing', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'persistent');
    const version = await versionOf(factory);

    const exit = await setup(factory, tasks(TaskEdited), 'persistent');

    expect(refusal(exit)).toBeInstanceOf(SetupRefused);
    expect(refusal(exit)?.reason).toBe('breaking');
    expect(await versionOf(factory)).toBe(version);
    expect(await titles(factory, tasks(), 'persistent')).toEqual(['Write']);
  });

  it('refuses an index change no Backfill covers, before any upgrade', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'persistent');
    const version = await versionOf(factory);

    const exit = await setup(factory, indexedWithoutBackfill(), 'persistent');

    expect(refusal(exit)?.reason).toBe('backfill-missing');
    expect(await versionOf(factory)).toBe(version);
    expect(await indexNames(factory)).not.toContain('GSI1');
  });

  it('can never become disposable', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'persistent');

    const exit = await setup(factory, tasks(), 'disposable');

    expect(refusal(exit)?.reason).toBe('mode-change');
  });

  it('refuses rows with no contract, ignoring an old _std_contract store', async () => {
    const factory = new IDBFactory();
    await seedWithoutContract(factory);

    const exit = await setup(factory, tasks(), 'persistent');

    expect(refusal(exit)?.reason).toBe('no-contract');
    expect(await appRecords(factory)).toHaveLength(1);
    expect(
      await inspect(factory, (database) =>
        database.objectStoreNames.contains('_std_contract'),
      ),
    ).toBe(true);
  });
});

describe('a disposable IndexedDB store', () => {
  it('is wiped by a breaking change', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'disposable');

    const exit = await setup(factory, tasks(TaskEdited), 'disposable');

    expect(outcome(exit)).toMatchObject({ kind: 'wiped' });
    expect(await appRecords(factory)).toEqual([]);
  });

  it('is wiped for a gap version, never running its Backfill', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'disposable');
    const owners: string[] = [];

    const exit = await setup(factory, ownedTasks(owners), 'disposable');

    expect(outcome(exit)).toMatchObject({ kind: 'wiped' });
    expect(owners).toEqual([]);
    expect(await appRecords(factory)).toEqual([]);
  });

  it('is wiped for a new index rather than reindexed', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'disposable');

    const exit = await setup(factory, indexedTasks(), 'disposable');

    expect(outcome(exit)).toMatchObject({ kind: 'wiped' });
    expect(await appRecords(factory)).toEqual([]);
    expect(await indexNames(factory)).toContain('GSI1');
  });

  it('is wiped when it holds rows but no contract', async () => {
    const factory = new IDBFactory();
    await seedWithoutContract(factory);

    const exit = await setup(factory, tasks(), 'disposable');

    expect(outcome(exit)).toMatchObject({ kind: 'wiped' });
    expect(await appRecords(factory)).toEqual([]);
  });

  it('keeps its rows when nothing changed', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'disposable');

    await setup(factory, tasks(), 'disposable');
    expect(await titles(factory, tasks(), 'disposable')).toEqual(['Write']);
  });
});

// Two tabs: two connections to one database, each with its own cache.
const tab = (factory: IDBFactory): IDBFactory => ({
  open: factory.open.bind(factory),
  deleteDatabase: factory.deleteDatabase.bind(factory),
  databases: factory.databases.bind(factory),
  cmp: factory.cmp.bind(factory),
});

const setupInTab = (factory: IDBFactory, table: AnyTable) =>
  Effect.runPromise(
    IDB.setup(table, {
      database: IDB.database({ databaseName: 'app', indexedDB: tab(factory) }),
      mode: 'persistent',
    }),
  );

describe('two IndexedDB tabs opening at once', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('run a Backfill once, one setup after the other', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'persistent');
    await insertTask(factory, tasks(), 'persistent', 't2');
    const owners: string[] = [];

    const outcomes = await Promise.all([
      setupInTab(factory, ownedTasks(owners)),
      setupInTab(factory, ownedTasks(owners)),
    ]);

    expect(outcomes.map(({ kind }) => kind).sort()).toEqual([
      'applied',
      'unchanged',
    ]);
    expect(owners.sort()).toEqual(['t1', 't2']);
  });

  it('both set up a fresh store without Web Locks', async () => {
    vi.stubGlobal('navigator', {});
    const factory = new IDBFactory();

    const outcomes = await Promise.all([
      setupInTab(factory, indexedTasks()),
      setupInTab(factory, indexedTasks()),
    ]);

    expect(outcomes.map(({ kind }) => kind).sort()).toEqual([
      'created',
      'unchanged',
    ]);
    expect((await indexNames(factory)).sort()).toEqual(['GSI1', '_entity']);
  });
});
