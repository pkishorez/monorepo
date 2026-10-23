import { Effect, Exit, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../eschema/index.js';
import { StdTable } from '../../index.js';
import { makeNodeSQLite } from '../drivers/node/index.js';
import { SetupRefused, SQLite, type TableMode } from '../index.js';

const TaskV1 = EntityESchema.make('Task', 'taskId', {
  title: Schema.String,
}).build();
// Editing a shipped version is breaking: rows stored under it may not read.
const TaskEdited = EntityESchema.make('Task', 'taskId', {
  title: Schema.String.check(Schema.isMaxLength(3)),
}).build();

const tasks = (schema = TaskV1, indexed = false) => {
  const table = StdTable.make('tasks')
    .primary('pk', 'sk')
    .gsi('GSI1', 'GSI1PK', 'GSI1SK')
    .build();
  const task = table.entity(schema).primary();
  return {
    table,
    task: (indexed
      ? task.index('GSI1', 'byTitle', { pk: ['title'] })
      : task
    ).build(),
  };
};

const setup = (
  database: ReturnType<typeof makeNodeSQLite>,
  table: ReturnType<typeof tasks>['table'],
  mode: TableMode,
) => Effect.runPromise(Effect.exit(SQLite.setup(table, { database, mode })));

const insertTask = (
  database: ReturnType<typeof makeNodeSQLite>,
  { table, task }: ReturnType<typeof tasks>,
) =>
  Effect.runPromise(
    task
      .insert({ taskId: 't1', title: 'Write the ADR' })
      .pipe(Effect.provide(SQLite.make(table, { database }).layer)),
  );

const rowCount = async (database: ReturnType<typeof makeNodeSQLite>) =>
  Number(
    (
      await Effect.runPromise(database.all('SELECT count(*) AS n FROM tasks'))
    )[0]?.n,
  );

const refusal = (exit: Exit.Exit<void, unknown>) =>
  Exit.isFailure(exit)
    ? (exit.cause.reasons.find((reason) => reason._tag === 'Fail')
        ?.error as SetupRefused)
    : undefined;

describe('a persistent SQLite table', () => {
  it('refuses a breaking change and keeps every row', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    const before = tasks();
    expect(
      Exit.isSuccess(await setup(database, before.table, 'persistent')),
    ).toBe(true);
    await insertTask(database, before);

    const exit = await setup(database, tasks(TaskEdited).table, 'persistent');

    expect(refusal(exit)).toBeInstanceOf(SetupRefused);
    expect(refusal(exit)?.reason).toBe('breaking');
    expect(refusal(exit)?.message).toMatch(/Task v1/);
    expect(await rowCount(database)).toBe(1);
    // The refusal changed nothing: the old contract still sets up cleanly.
    expect(
      Exit.isSuccess(await setup(database, before.table, 'persistent')),
    ).toBe(true);
  });

  it('can never become disposable', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    const before = tasks();
    await setup(database, before.table, 'persistent');
    await insertTask(database, before);

    const exit = await setup(database, tasks().table, 'disposable');

    expect(refusal(exit)?.reason).toBe('mode-change');
    expect(await rowCount(database)).toBe(1);
  });

  it('accepts a change that needs a backfill and keeps every row', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    const before = tasks();
    await setup(database, before.table, 'persistent');
    await insertTask(database, before);

    const exit = await setup(database, tasks(TaskV1, true).table, 'persistent');

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(await rowCount(database)).toBe(1);
  });

  it('adopts a table set up before it had a contract, keeping its rows', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    const before = tasks();
    await setup(database, before.table, 'persistent');
    await insertTask(database, before);
    await Effect.runPromise(database.run('DELETE FROM _std_contract'));

    expect(
      Exit.isSuccess(await setup(database, before.table, 'persistent')),
    ).toBe(true);
    expect(await rowCount(database)).toBe(1);
  });

  it('refuses a caller the types do not reach that declares no mode', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    const exit = await Effect.runPromise(
      Effect.exit(
        SQLite.setup(tasks().table, {
          database,
          mode: undefined as unknown as TableMode,
        }),
      ),
    );
    expect(
      Exit.isFailure(exit) && String(Exit.isFailure(exit) && exit.cause),
    ).toMatch(/has no mode/);
  });

  it('is the same table under another letter case', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    const before = tasks();
    await setup(database, before.table, 'persistent');
    await insertTask(database, before);

    const exit = await Effect.runPromise(
      Effect.exit(
        SQLite.setup(tasks(TaskEdited).table, {
          database,
          mode: 'disposable',
          tableName: 'TASKS',
        }),
      ),
    );

    expect(refusal(exit)?.reason).toBe('mode-change');
    expect(await rowCount(database)).toBe(1);
  });

  it('reserves the contract table name', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    const exit = await Effect.runPromise(
      Effect.exit(
        SQLite.setup(tasks().table, {
          database,
          mode: 'persistent',
          tableName: '_std_contract',
        }),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('setups that race', () => {
  it('never wipe a table another setup made persistent meanwhile', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    const before = tasks();
    await setup(database, before.table, 'disposable');
    await insertTask(database, before);

    // Right after the stale setup reads the contract, a newer one promotes
    // the table and writes a row the stale setup has never seen.
    let raced = false;
    const racing = {
      ...database,
      all: (sql: string, parameters?: Parameters<typeof database.all>[1]) =>
        database.all(sql, parameters).pipe(
          Effect.tap(() =>
            raced || !sql.startsWith('SELECT mode, hash')
              ? Effect.void
              : Effect.promise(async () => {
                  raced = true;
                  await setup(database, before.table, 'persistent');
                  await Effect.runPromise(
                    before.task
                      .insert({ taskId: 't2', title: 'Second' })
                      .pipe(
                        Effect.provide(
                          SQLite.make(before.table, { database }).layer,
                        ),
                      ),
                  );
                }),
          ),
        ),
    };

    const exit = await Effect.runPromise(
      Effect.exit(
        SQLite.setup(tasks(TaskEdited).table, {
          database: racing,
          mode: 'disposable',
        }),
      ),
    );

    expect(raced).toBe(true);
    expect(refusal(exit)?.reason).toBe('mode-change');
    expect(await rowCount(database)).toBe(2);
  });
});

describe('a disposable SQLite table', () => {
  it('is wiped by a breaking change, then set up under the new contract', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    const before = tasks();
    await setup(database, before.table, 'disposable');
    await insertTask(database, before);

    const after = tasks(TaskEdited);
    expect(
      Exit.isSuccess(await setup(database, after.table, 'disposable')),
    ).toBe(true);
    expect(await rowCount(database)).toBe(0);

    // The new contract is recorded: setting up again keeps what is written now.
    await Effect.runPromise(
      after.task
        .insert({ taskId: 't2', title: 'ok' })
        .pipe(Effect.provide(SQLite.make(after.table, { database }).layer)),
    );
    await setup(database, after.table, 'disposable');
    expect(await rowCount(database)).toBe(1);
  });

  it('is wiped by a change that needs a backfill, since SQLite has none', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    const before = tasks();
    await setup(database, before.table, 'disposable');
    await insertTask(database, before);

    expect(
      Exit.isSuccess(
        await setup(database, tasks(TaskV1, true).table, 'disposable'),
      ),
    ).toBe(true);
    expect(await rowCount(database)).toBe(0);
  });

  it('keeps its rows when nothing changed', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    const before = tasks();
    await setup(database, before.table, 'disposable');
    await insertTask(database, before);

    await setup(database, tasks().table, 'disposable');
    expect(await rowCount(database)).toBe(1);
  });

  it('may become persistent, and is then guarded', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    const before = tasks();
    await setup(database, before.table, 'disposable');
    await insertTask(database, before);

    expect(
      Exit.isSuccess(await setup(database, before.table, 'persistent')),
    ).toBe(true);
    expect(await rowCount(database)).toBe(1);
    const exit = await setup(database, tasks(TaskEdited).table, 'persistent');
    expect(refusal(exit)?.reason).toBe('breaking');
    expect(await rowCount(database)).toBe(1);
  });
});
