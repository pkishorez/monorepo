import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { Effect, Exit, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../eschema/index.js';
import { StdTable } from '../../index.js';
import {
  IDB,
  SetupRefused,
  type BackfillChoice,
  type TableMode,
} from '../index.js';

const TaskV1 = EntityESchema.make('Task', 'taskId', {
  title: Schema.String,
}).build();
// Editing a shipped version is breaking: rows stored under it may not read.
const TaskEdited = EntityESchema.make('Task', 'taskId', {
  title: Schema.String.check(Schema.isMaxLength(3)),
}).build();

const makeTable = () =>
  StdTable.make('tasks').primary('pk', 'sk').gsi('GSI1', 'GSI1PK', 'GSI1SK');

const tasks = (schema = TaskV1) => {
  const table = makeTable()
    .entity(schema, (e) => e.primary())
    .build();
  return { table, task: table.Task };
};

// The same table with a new access pattern: a change that needs a backfill.
const indexedTasks = () => {
  const table = makeTable()
    .entity(TaskV1, (e) =>
      e.primary().index('GSI1', 'byTitle', { pk: ['title'], sk: ['taskId'] }),
    )
    .build();
  return { table, task: table.Task };
};

// Each setup gets a fresh connection, as a new page load would.
const connect = (factory: IDBFactory) =>
  IDB.database({ databaseName: 'app', indexedDB: factory });

const config = (
  factory: IDBFactory,
  mode: TableMode,
  onBackfill?: BackfillChoice,
) => ({
  database: connect(factory),
  mode,
  ...(onBackfill === undefined ? {} : { onBackfill }),
});

const setup = (
  factory: IDBFactory,
  table: ReturnType<typeof tasks>['table'],
  mode: TableMode,
  onBackfill?: BackfillChoice,
) =>
  Effect.runPromise(
    Effect.exit(IDB.setup(table, config(factory, mode, onBackfill))),
  );

const insertTask = (
  factory: IDBFactory,
  { table, task }: ReturnType<typeof tasks>,
  mode: TableMode,
) =>
  Effect.runPromise(
    task
      .insert({ taskId: 't1', title: 'Write' })
      .pipe(Effect.provide(IDB.make(table, config(factory, mode)).layer)),
  );

const titles = (
  factory: IDBFactory,
  { table, task }: ReturnType<typeof tasks>,
  mode: TableMode,
) =>
  Effect.runPromise(
    task.get({ taskId: 't1' }).pipe(
      Effect.map((found) => (found === null ? [] : [found.value.title])),
      Effect.provide(IDB.make(table, config(factory, mode)).layer),
    ),
  );

const refusal = (exit: Exit.Exit<void, unknown>) =>
  Exit.isFailure(exit)
    ? (exit.cause.reasons.find((reason) => reason._tag === 'Fail')
        ?.error as SetupRefused)
    : undefined;

describe('a persistent IndexedDB store', () => {
  it('refuses a breaking change and keeps every row', async () => {
    const factory = new IDBFactory();
    const before = tasks();
    await insertTask(factory, before, 'persistent');

    const exit = await setup(factory, tasks(TaskEdited).table, 'persistent');

    expect(refusal(exit)).toBeInstanceOf(SetupRefused);
    expect(refusal(exit)?.reason).toBe('breaking');
    expect(await titles(factory, before, 'persistent')).toEqual(['Write']);
  });

  it('can never become disposable', async () => {
    const factory = new IDBFactory();
    const before = tasks();
    await insertTask(factory, before, 'persistent');

    const exit = await setup(factory, tasks().table, 'disposable');

    expect(refusal(exit)?.reason).toBe('mode-change');
  });

  it('reindexes stored rows for a change that needs a backfill', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'persistent');

    const after = indexedTasks();
    expect(
      Exit.isSuccess(await setup(factory, after.table, 'persistent')),
    ).toBe(true);
    const found = await Effect.runPromise(
      after.task
        .query('byTitle', {
          pk: { title: 'Write' },
          '>': { taskId: '' },
        })
        .pipe(
          Effect.map(({ items }) => items.length),
          Effect.provide(
            IDB.make(after.table, config(factory, 'persistent')).layer,
          ),
        ),
    );
    expect(found).toBe(1);
  });
});

describe('a disposable IndexedDB store', () => {
  it('is wiped by a breaking change', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'disposable');

    const after = tasks(TaskEdited);
    expect(
      Exit.isSuccess(await setup(factory, after.table, 'disposable')),
    ).toBe(true);
    expect(await titles(factory, after, 'disposable')).toEqual([]);
  });

  it('reindexes by default for a change that needs a backfill', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'disposable');

    const after = indexedTasks();
    await setup(factory, after.table, 'disposable');
    expect(await titles(factory, after, 'disposable')).toEqual(['Write']);
  });

  it('is wiped for a change that needs a backfill when it chooses to be', async () => {
    const factory = new IDBFactory();
    await insertTask(factory, tasks(), 'disposable');

    const after = indexedTasks();
    await setup(factory, after.table, 'disposable', 'wipe');
    expect(await titles(factory, after, 'disposable')).toEqual([]);
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
  it('never wipe a store another tab made persistent meanwhile', async () => {
    const factory = new IDBFactory();
    const before = tasks();
    await insertTask(factory, before, 'disposable');

    // Right after the stale tab reads the contract, a newer tab promotes the
    // store and writes a row the stale tab has never seen.
    const connection = connect(factory);
    let raced = false;
    const racing = {
      ...connection,
      readContract: (storeName: string) =>
        connection.readContract(storeName).pipe(
          Effect.tap(() =>
            raced
              ? Effect.void
              : Effect.promise(async () => {
                  raced = true;
                  await setup(factory, before.table, 'persistent');
                  await Effect.runPromise(
                    before.task
                      .insert({ taskId: 't2', title: 'Second' })
                      .pipe(
                        Effect.provide(
                          IDB.make(before.table, config(factory, 'persistent'))
                            .layer,
                        ),
                      ),
                  );
                }),
          ),
        ),
    };

    const exit = await Effect.runPromise(
      Effect.exit(
        IDB.setup(tasks(TaskEdited).table, {
          database: racing,
          mode: 'disposable',
        }),
      ),
    );

    expect(raced).toBe(true);
    expect(refusal(exit)?.reason).toBe('mode-change');
    expect(await titles(factory, before, 'persistent')).toEqual(['Write']);
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
                      IDB.make(before.table, {
                        database: connect(factory),
                        mode: 'persistent',
                      }).layer,
                    ),
                  ),
              );
            })
        ).pipe(Effect.andThen(after.table.drift(item))),
    };

    expect(
      Exit.isSuccess(
        await Effect.runPromise(
          Effect.exit(IDB.setup(racing, config(factory, 'persistent'))),
        ),
      ),
    ).toBe(true);
    expect(rewritten).toBe(true);
    const found = await Effect.runPromise(
      after.task
        .query('byTitle', { pk: { title: 'Write' }, '>': { taskId: '' } })
        .pipe(
          Effect.map(({ items }) => items.length),
          Effect.provide(
            IDB.make(after.table, config(factory, 'persistent')).layer,
          ),
        ),
    );
    expect(found).toBe(1);
  });
});
