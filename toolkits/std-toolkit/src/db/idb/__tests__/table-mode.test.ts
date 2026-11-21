import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { Effect, Exit, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../eschema/index.js';
import { TableSnapshot } from '../../../snapshot/index.js';
import { StdTable } from '../../index.js';
import {
  decodeStoredSnapshot,
  joinTableSnapshot,
  readStoredSnapshot,
} from '../../table-snapshot/index.js';
import {
  IDB,
  SetupRefused,
  type BackfillChoice,
  type IDBConnection,
  type TableMode,
} from '../index.js';
import { makeTableContract } from '../table/index.js';

const TaskV1 = EntityESchema.make('Task', 'taskId', {
  title: Schema.String,
}).build();
// Editing a shipped version is breaking: rows stored under it may not read.
const TaskEdited = EntityESchema.make('Task', 'taskId', {
  title: Schema.String.check(Schema.isMaxLength(3)),
}).build();
const NoteV1 = EntityESchema.make('Note', 'noteId', {
  body: Schema.String,
}).build();

const makeTable = (secondIndex = false) => {
  const table = StdTable.make('tasks')
    .primary('pk', 'sk')
    .gsi('GSI1', 'GSI1PK', 'GSI1SK');
  return (secondIndex ? table.gsi('GSI2', 'GSI2PK', 'GSI2SK') : table).build();
};

const tasks = (schema = TaskV1) => {
  const table = makeTable();
  return { table, task: table.entity(schema).primary().build() };
};

type Tasks = ReturnType<typeof tasks>;

// The same table with a new access pattern: a change that needs a backfill.
const indexedTasks = () => {
  const table = makeTable();
  const task = table
    .entity(TaskV1)
    .primary()
    .index('GSI1', 'byTitle', { pk: ['title'], sk: ['taskId'] })
    .build();
  return { table, task };
};

// The same table with a new entity: an additive change.
const tasksAndNotes = () => {
  const code = tasks();
  code.table.entity(NoteV1).primary().build();
  return code;
};

const connect = (factory: IDBFactory) =>
  IDB.database({ databaseName: 'app', indexedDB: factory });

// Another tab: its own connection to the same database.
const tab = (factory: IDBFactory) =>
  IDB.database({
    databaseName: 'app',
    indexedDB: {
      open: factory.open.bind(factory),
      deleteDatabase: factory.deleteDatabase.bind(factory),
      databases: factory.databases.bind(factory),
      cmp: factory.cmp.bind(factory),
    },
  });

const config = (
  database: IDBConnection,
  mode: TableMode,
  onBackfill?: BackfillChoice,
) => ({
  database,
  mode,
  ...(onBackfill === undefined ? {} : { onBackfill }),
});

const setup = (
  factory: IDBFactory,
  table: Tasks['table'],
  mode: TableMode,
  onBackfill?: BackfillChoice,
) =>
  Effect.runPromise(
    Effect.exit(IDB.setup(table, config(connect(factory), mode, onBackfill))),
  );

const insertTask = (
  factory: IDBFactory,
  { table, task }: Tasks,
  mode: TableMode,
  taskId = 't1',
  title = 'Write',
) =>
  Effect.runPromise(
    task
      .insert({ taskId, title })
      .pipe(
        Effect.provide(IDB.make(table, config(connect(factory), mode)).layer),
      ),
  );

const titles = (
  factory: IDBFactory,
  { table, task }: Tasks,
  mode: TableMode,
  taskIds = ['t1'],
) =>
  Effect.runPromise(
    Effect.forEach(taskIds, (taskId) => task.get({ taskId })).pipe(
      Effect.map((found) =>
        found.flatMap((each) => (each === null ? [] : [each.value.title])),
      ),
      Effect.provide(IDB.make(table, config(connect(factory), mode)).layer),
    ),
  );

const byTitle = (
  factory: IDBFactory,
  { table, task }: ReturnType<typeof indexedTasks>,
) =>
  Effect.runPromise(
    task.query('byTitle', { pk: { title: 'Write' }, '>': { taskId: '' } }).pipe(
      Effect.map(({ items }) => items.length),
      Effect.provide(
        IDB.make(table, config(connect(factory), 'persistent')).layer,
      ),
    ),
  );

const internalContract = (factory: IDBFactory) =>
  makeTableContract(
    connect(factory),
    { localSecondaryIndexes: {}, globalSecondaryIndexes: {} },
    'tasks',
  );

/** The snapshot and mode the store keeps in its internal entities. */
const stored = (factory: IDBFactory) =>
  Effect.runPromise(
    readStoredSnapshot(internalContract(factory)).pipe(
      Effect.flatMap(decodeStoredSnapshot),
      Effect.flatMap((values) =>
        values === undefined
          ? Effect.succeed(undefined)
          : joinTableSnapshot(values),
      ),
    ),
  );

const forgetSnapshot = (factory: IDBFactory) =>
  Effect.runPromise(
    Effect.forEach(
      ['__snapshot', '__snapshot_entity', '__snapshot_version'],
      (entity) => internalContract(factory).hardDeleteEntityItems(entity),
    ),
  );

const requested = <A>(request: IDBRequest<A>) =>
  new Promise<A>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** Everything setup could change: the version, the stores, the indexes, and every Record. */
const everything = async (factory: IDBFactory) => {
  const database = await connect(factory).open();
  const store = database.transaction('tasks').objectStore('tasks');
  return {
    version: database.version,
    stores: [...database.objectStoreNames],
    indexes: [...store.indexNames].map((name) => ({
      name,
      keyPath: store.index(name).keyPath,
    })),
    records: await requested(store.getAll()),
  };
};

const failureOf = (exit: Exit.Exit<void, unknown>) =>
  Exit.isFailure(exit)
    ? exit.cause.reasons.find((reason) => reason._tag === 'Fail')?.error
    : undefined;

const refusal = (exit: Exit.Exit<void, unknown>) =>
  failureOf(exit) as SetupRefused | undefined;

describe('a persistent IndexedDB store', () => {
  it('records its first snapshot, with the store and its indexes', async () => {
    const factory = new IDBFactory();
    const code = tasks();

    expect(Exit.isSuccess(await setup(factory, code.table, 'persistent'))).toBe(
      true,
    );

    const recorded = await stored(factory);
    expect(recorded?.mode).toBe('persistent');
    expect(
      TableSnapshot.diff(recorded!.snapshot, TableSnapshot.capture(code.table)),
    ).toEqual([]);
    const { indexes } = await everything(factory);
    expect(indexes.map(({ name }) => name)).toEqual(['GSI1', '_entity']);
  });

  it('changes nothing when nothing changed', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'persistent');
    const recorded = await everything(factory);

    expect(
      Exit.isSuccess(await setup(factory, tasks().table, 'persistent')),
    ).toBe(true);
    expect(await everything(factory)).toEqual(recorded);
  });

  it('records an additive change and keeps every row', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'persistent');

    const after = tasksAndNotes();
    expect(
      Exit.isSuccess(await setup(factory, after.table, 'persistent')),
    ).toBe(true);
    expect(await titles(factory, after, 'persistent')).toEqual(['Write']);
    expect(
      (await stored(factory))?.snapshot.entities.map(({ name }) => name),
    ).toContain('Note');
  });

  it('refuses a breaking change, changing nothing at all', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'persistent');
    const recorded = await everything(factory);

    // A breaking edit that also adds a secondary index: the index waits for
    // the check, so the refusal leaves it out.
    const after = makeTable(true);
    after.entity(TaskEdited).primary().build();
    const exit = await setup(factory, after, 'persistent');

    expect(refusal(exit)).toBeInstanceOf(SetupRefused);
    expect(refusal(exit)?.reason).toBe('breaking');
    expect(await everything(factory)).toEqual(recorded);
  });

  it('can never become disposable', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'persistent');
    const recorded = await everything(factory);

    const exit = await setup(factory, tasks().table, 'disposable');

    expect(refusal(exit)?.reason).toBe('mode-change');
    expect(await everything(factory)).toEqual(recorded);
  });

  it('reindexes stored rows for a change that needs a backfill, even when asked to wipe', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'persistent');

    const after = indexedTasks();
    expect(
      Exit.isSuccess(await setup(factory, after.table, 'persistent', 'wipe')),
    ).toBe(true);
    expect(await byTitle(factory, after)).toBe(1);
  });

  it('keeps the rows of a store that has no snapshot', async () => {
    const factory = new IDBFactory();
    const code = tasks();
    await insertTask(factory, code, 'persistent');
    await forgetSnapshot(factory);

    expect(Exit.isSuccess(await setup(factory, code.table, 'persistent'))).toBe(
      true,
    );
    expect(await titles(factory, code, 'persistent')).toEqual(['Write']);
    expect((await stored(factory))?.mode).toBe('persistent');
  });
});

describe('a disposable IndexedDB store', () => {
  it('is wiped by a breaking change, and writable after', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'disposable');

    const after = tasks(TaskEdited);
    expect(
      Exit.isSuccess(await setup(factory, after.table, 'disposable')),
    ).toBe(true);
    expect(await titles(factory, after, 'disposable')).toEqual([]);
    await insertTask(factory, after, 'disposable', 't2', 'ok');
    expect(await titles(factory, after, 'disposable', ['t2'])).toEqual(['ok']);
  });

  it('reindexes by default for a change that needs a backfill', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'disposable');

    const after = indexedTasks();
    expect(
      Exit.isSuccess(await setup(factory, after.table, 'disposable')),
    ).toBe(true);
    expect(await byTitle(factory, after)).toBe(1);
  });

  it('is wiped for a change that needs a backfill when it chooses to be', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'disposable');

    const after = indexedTasks();
    expect(
      Exit.isSuccess(await setup(factory, after.table, 'disposable', 'wipe')),
    ).toBe(true);
    expect(await titles(factory, after, 'disposable')).toEqual([]);
    expect(
      TableSnapshot.diff(
        (await stored(factory))!.snapshot,
        TableSnapshot.capture(after.table),
      ),
    ).toEqual([]);
  });

  it('is wiped when it has rows but no snapshot', async () => {
    const factory = new IDBFactory();
    const code = tasks();
    await insertTask(factory, code, 'disposable');
    await forgetSnapshot(factory);

    expect(Exit.isSuccess(await setup(factory, code.table, 'disposable'))).toBe(
      true,
    );
    expect(await titles(factory, code, 'disposable')).toEqual([]);
    expect((await stored(factory))?.mode).toBe('disposable');
  });

  it('keeps its rows when nothing changed', async () => {
    const factory = new IDBFactory();
    const before = tasks();
    await insertTask(factory, before, 'disposable');

    await setup(factory, tasks().table, 'disposable');
    expect(await titles(factory, before, 'disposable')).toEqual(['Write']);
  });
});

describe('IndexedDB setups that race', () => {
  it('both set up one store, from two tabs at once, which records one snapshot', async () => {
    const factory = new IDBFactory();
    const code = tasks();

    const exits = await Promise.all(
      [tab(factory), tab(factory)].map((database) =>
        Effect.runPromise(
          Effect.exit(IDB.setup(code.table, config(database, 'persistent'))),
        ),
      ),
    );

    expect(exits.map(failureOf)).toEqual([undefined, undefined]);
    const { records } = await everything(factory);
    expect(records.filter((record) => record._e === '__snapshot')).toHaveLength(
      1,
    );
    const recorded = await everything(factory);
    await setup(factory, tasks().table, 'persistent');
    expect(await everything(factory)).toEqual(recorded);
  });

  it('never wipe a store another tab made persistent meanwhile', async () => {
    const factory = new IDBFactory();
    const before = tasks();
    await insertTask(factory, before, 'disposable');

    // The stale setup reads `__snapshot` and the two other partitions of the
    // stored snapshot, three uses of the database, then wipes. Between the
    // two, a newer tab promotes the store and writes a row the stale setup
    // has never seen.
    const connection = connect(factory);
    let uses = 0;
    let raced = false;
    const racing: IDBConnection = {
      ...connection,
      open: async () => {
        if (++uses === 4) {
          raced = true;
          await setup(factory, before.table, 'persistent');
          await insertTask(factory, before, 'persistent', 't2');
        }
        return connection.open();
      },
    };

    const exit = await Effect.runPromise(
      Effect.exit(
        IDB.setup(tasks(TaskEdited).table, config(racing, 'disposable')),
      ),
    );

    expect(raced).toBe(true);
    expect(refusal(exit)?.reason).toBe('mode-change');
    expect(await titles(factory, before, 'persistent', ['t1', 't2'])).toEqual([
      'Write',
      'Write',
    ]);
  });

  it('reindexes a row an older tab rewrote during the backfill', async () => {
    const factory = new IDBFactory();
    const before = tasks();
    await insertTask(factory, before, 'persistent');

    // The first drift is stale: an older tab rewrites the row, without the
    // new index keys, before this setup reindexes it.
    const after = indexedTasks();
    let rewritten = false;
    const racing = {
      ...after.table,
      scan: () => after.table.scan(),
      reindex: (currentForm: Parameters<typeof after.table.reindex>[0]) =>
        after.table.reindex(currentForm),
      drift: (item: Parameters<typeof after.table.drift>[0]) =>
        (rewritten
          ? Effect.void
          : Effect.promise(async () => {
              rewritten = true;
              await Effect.runPromise(
                before.task
                  .getAndUpdate({ taskId: 't1' }, { title: 'Write' })
                  .pipe(
                    Effect.provide(
                      IDB.make(
                        before.table,
                        config(connect(factory), 'persistent'),
                      ).layer,
                    ),
                  ),
              );
            })
        ).pipe(Effect.andThen(after.table.drift(item))),
    };

    expect(
      Exit.isSuccess(
        await Effect.runPromise(
          Effect.exit(
            IDB.setup(racing, config(connect(factory), 'persistent')),
          ),
        ),
      ),
    ).toBe(true);
    expect(rewritten).toBe(true);
    expect(await byTitle(factory, after)).toBe(1);
  });
});
