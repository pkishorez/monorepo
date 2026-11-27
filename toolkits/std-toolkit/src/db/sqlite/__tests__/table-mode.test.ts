import { Effect, Exit, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../eschema/index.js';
import { StdTable } from '../../index.js';
import type { SQLiteDriver } from '../database/index.js';
import { SetupRefused, SQLite, type TableMode } from '../index.js';
import { inMemoryDrivers } from './drivers.js';

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

type Tasks = ReturnType<typeof tasks>;

const setup = (
  database: SQLiteDriver,
  table: Parameters<typeof SQLite.setup>[0],
  mode: TableMode,
) => Effect.runPromise(Effect.exit(SQLite.setup(table, { database, mode })));

const insertTask = (
  database: SQLiteDriver,
  { table, task }: Tasks,
  taskId = 't1',
) =>
  Effect.runPromise(
    task
      .insert({ taskId, title: 'Write' })
      .pipe(Effect.provide(SQLite.make(table, { database }).layer)),
  );

const query = (database: SQLiteDriver, sql: string) =>
  Effect.runPromise(database.all(sql));

/** The app's rows, without the internal entities' items. */
const rowCount = async (database: SQLiteDriver) =>
  Number(
    (
      await query(
        database,
        "SELECT count(*) AS n FROM tasks WHERE substr(_e, 1, 2) <> '__'",
      )
    )[0]?.n,
  );

/** Everything setup could change: the schema, and every row, internal ones too. */
const everything = async (database: SQLiteDriver) => ({
  schema: await query(
    database,
    'SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY name',
  ),
  rows: await query(database, 'SELECT * FROM tasks ORDER BY pk, sk'),
});

const snapshotItems = (database: SQLiteDriver) =>
  query(
    database,
    "SELECT _e, sk, _u FROM tasks WHERE substr(_e, 1, 2) = '__' ORDER BY pk, sk",
  );

const failureOf = (exit: Exit.Exit<void, unknown>) =>
  Exit.isFailure(exit)
    ? exit.cause.reasons.find((reason) => reason._tag === 'Fail')?.error
    : undefined;

const refusal = (exit: Exit.Exit<void, unknown>) =>
  failureOf(exit) as SetupRefused | undefined;

describe.each(inMemoryDrivers)('SQLite setup on %s', (_, makeDriver) => {
  describe('a persistent table', () => {
    it('records its first snapshot as internal entities', async () => {
      const database = makeDriver();
      expect(
        Exit.isSuccess(await setup(database, tasks().table, 'persistent')),
      ).toBe(true);

      const items = await snapshotItems(database);
      expect(items.filter(({ _e }) => _e === '__snapshot')).toHaveLength(1);
      expect(items.map(({ _e }) => _e)).toEqual(
        expect.arrayContaining(['__snapshot_entity', '__snapshot_version']),
      );
      const listed = await query(database, 'PRAGMA index_list("tasks")');
      expect(listed.map(({ name }) => name)).toContain('idx_tasks_GSI1');
    });

    it('writes nothing when nothing changed', async () => {
      const database = makeDriver();
      const before = tasks();
      await setup(database, before.table, 'persistent');
      await insertTask(database, before);
      const recorded = await everything(database);

      expect(
        Exit.isSuccess(await setup(database, tasks().table, 'persistent')),
      ).toBe(true);
      expect(await everything(database)).toEqual(recorded);
    });

    it('refuses a breaking change, changing nothing at all', async () => {
      const database = makeDriver();
      const before = tasks();
      expect(
        Exit.isSuccess(await setup(database, before.table, 'persistent')),
      ).toBe(true);
      await insertTask(database, before);
      const recorded = await everything(database);

      // A breaking edit that also adds a secondary index: the index waits for
      // the check, so the refusal leaves it out.
      const after = StdTable.make('tasks')
        .primary('pk', 'sk')
        .gsi('GSI1', 'GSI1PK', 'GSI1SK')
        .gsi('GSI2', 'GSI2PK', 'GSI2SK')
        .build();
      after.entity(TaskEdited).primary().build();
      const exit = await setup(database, after, 'persistent');

      expect(refusal(exit)).toBeInstanceOf(SetupRefused);
      expect(refusal(exit)?.reason).toBe('breaking');
      expect(refusal(exit)?.message).toMatch(/Task v1/);
      expect(await everything(database)).toEqual(recorded);
      expect(
        Exit.isSuccess(await setup(database, before.table, 'persistent')),
      ).toBe(true);
    });

    it('can never become disposable', async () => {
      const database = makeDriver();
      const before = tasks();
      await setup(database, before.table, 'persistent');
      await insertTask(database, before);
      const recorded = await everything(database);

      const exit = await setup(database, tasks().table, 'disposable');

      expect(refusal(exit)?.reason).toBe('mode-change');
      expect(await everything(database)).toEqual(recorded);
    });

    it('accepts an additive change that needs a backfill, adding its index columns and keeping every row', async () => {
      const database = makeDriver();
      const before = StdTable.make('tasks').primary('pk', 'sk').build();
      const task = before.entity(TaskV1).primary().build();
      await setup(database, before, 'persistent');
      await Effect.runPromise(
        task
          .insert({ taskId: 't1', title: 'Write' })
          .pipe(Effect.provide(SQLite.make(before, { database }).layer)),
      );

      const exit = await setup(
        database,
        tasks(TaskV1, true).table,
        'persistent',
      );

      expect(Exit.isSuccess(exit)).toBe(true);
      expect(await rowCount(database)).toBe(1);
      const columns = await query(database, 'PRAGMA table_info("tasks")');
      expect(columns.map(({ name }) => name)).toEqual(
        expect.arrayContaining(['GSI1PK', 'GSI1SK']),
      );
      // The new snapshot is recorded: the same code is now unchanged.
      const recorded = await everything(database);
      await setup(database, tasks(TaskV1, true).table, 'persistent');
      expect(await everything(database)).toEqual(recorded);
    });

    it('keeps the rows of a table that has no snapshot', async () => {
      const database = makeDriver();
      const before = tasks();
      await setup(database, before.table, 'persistent');
      await insertTask(database, before);
      await Effect.runPromise(
        database.run("DELETE FROM tasks WHERE substr(_e, 1, 2) = '__'"),
      );

      expect(
        Exit.isSuccess(await setup(database, before.table, 'persistent')),
      ).toBe(true);
      expect(await rowCount(database)).toBe(1);
      expect(await snapshotItems(database)).not.toHaveLength(0);
    });

    it('refuses a table under another primary key with no snapshot, writing nothing', async () => {
      const database = makeDriver();
      const before = tasks();
      await setup(database, before.table, 'persistent');
      await insertTask(database, before);
      await Effect.runPromise(
        database.run("DELETE FROM tasks WHERE substr(_e, 1, 2) = '__'"),
      );
      const recorded = await everything(database);

      const after = StdTable.make('tasks').primary('id', 'sort').build();
      after.entity(TaskV1).primary().build();
      // Every run is refused the same way: none records a snapshot that
      // would claim the code's primary key.
      for (let run = 0; run < 2; run++) {
        const failure = failureOf(await setup(database, after, 'persistent'));
        expect(failure).toMatchObject({ _tag: 'OperationFailure' });
        expect(String((failure as { cause: unknown }).cause)).toMatch(
          /has the primary key \(pk, sk\), not the code's \(id, sort\)/,
        );
        expect(await everything(database)).toEqual(recorded);
      }
      expect(
        Exit.isSuccess(await setup(database, before.table, 'persistent')),
      ).toBe(true);
      expect(await rowCount(database)).toBe(1);
    });

    it('refuses a caller the types do not reach that declares no mode', async () => {
      const exit = await setup(
        makeDriver(),
        tasks().table,
        undefined as unknown as TableMode,
      );
      expect(Exit.isFailure(exit) && String(exit.cause)).toMatch(/has no mode/);
    });

    it('is the same table under another letter case', async () => {
      const database = makeDriver();
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

    it('reserves the name of the retired contract table', async () => {
      const exit = await Effect.runPromise(
        Effect.exit(
          SQLite.setup(tasks().table, {
            database: makeDriver(),
            mode: 'persistent',
            tableName: '_STD_contract',
          }),
        ),
      );
      expect(Exit.isFailure(exit)).toBe(true);
    });
  });

  describe('a disposable table', () => {
    it('is dropped and recreated on a breaking change, and writable after', async () => {
      const database = makeDriver();
      const before = tasks();
      await setup(database, before.table, 'disposable');
      await insertTask(database, before);

      const after = tasks(TaskEdited);
      expect(
        Exit.isSuccess(await setup(database, after.table, 'disposable')),
      ).toBe(true);
      expect(await rowCount(database)).toBe(0);
      const listed = await query(database, 'PRAGMA index_list("tasks")');
      expect(listed.map(({ name }) => name)).toContain('idx_tasks_GSI1');

      // The new snapshot is recorded: setting up again keeps what is written now.
      await Effect.runPromise(
        after.task
          .insert({ taskId: 't2', title: 'ok' })
          .pipe(Effect.provide(SQLite.make(after.table, { database }).layer)),
      );
      expect(
        Exit.isSuccess(await setup(database, after.table, 'disposable')),
      ).toBe(true);
      expect(await rowCount(database)).toBe(1);
    });

    it('is wiped by a change that needs a backfill, since SQLite has none', async () => {
      const database = makeDriver();
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

    it('is wiped when it has rows but no snapshot', async () => {
      const database = makeDriver();
      const before = tasks();
      await setup(database, before.table, 'disposable');
      await insertTask(database, before);
      await Effect.runPromise(
        database.run("DELETE FROM tasks WHERE substr(_e, 1, 2) = '__'"),
      );

      expect(
        Exit.isSuccess(await setup(database, before.table, 'disposable')),
      ).toBe(true);
      expect(await rowCount(database)).toBe(0);
    });

    it('is recreated under a new primary key', async () => {
      const database = makeDriver();
      const before = tasks();
      await setup(database, before.table, 'disposable');
      await insertTask(database, before);

      const after = StdTable.make('tasks').primary('PK', 'SK').build();
      const task = after.entity(TaskV1).primary().build();
      expect(Exit.isSuccess(await setup(database, after, 'disposable'))).toBe(
        true,
      );
      const columns = await query(database, 'PRAGMA table_info("tasks")');
      expect(columns.map(({ name }) => name)).toContain('PK');
      await Effect.runPromise(
        task
          .insert({ taskId: 't2', title: 'ok' })
          .pipe(Effect.provide(SQLite.make(after, { database }).layer)),
      );
      expect(await rowCount(database)).toBe(1);
    });

    it('keeps its rows when nothing changed', async () => {
      const database = makeDriver();
      const before = tasks();
      await setup(database, before.table, 'disposable');
      await insertTask(database, before);

      await setup(database, tasks().table, 'disposable');
      expect(await rowCount(database)).toBe(1);
    });

    it('may become persistent, and is then guarded', async () => {
      const database = makeDriver();
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

  describe('setups that race', () => {
    // Every statement yields first, so two setups interleave statement by
    // statement, as two processes on one database file would.
    const interleaved = (database: SQLiteDriver): SQLiteDriver => ({
      run: (sql, parameters) =>
        Effect.yieldNow.pipe(Effect.andThen(database.run(sql, parameters))),
      all: (sql, parameters) =>
        Effect.yieldNow.pipe(Effect.andThen(database.all(sql, parameters))),
      transaction: (statements) =>
        Effect.yieldNow.pipe(Effect.andThen(database.transaction(statements))),
    });

    it('both set up one table, which records one snapshot', async () => {
      const database = makeDriver();
      const racing = interleaved(database);
      const exits = await Effect.runPromise(
        Effect.all(
          [1, 2].map(() =>
            Effect.exit(
              SQLite.setup(tasks().table, {
                database: racing,
                mode: 'persistent',
              }),
            ),
          ),
          { concurrency: 'unbounded' },
        ),
      );

      expect(exits.map(failureOf)).toEqual([undefined, undefined]);
      const items = await snapshotItems(database);
      expect(items.filter(({ _e }) => _e === '__snapshot')).toHaveLength(1);
      const recorded = await everything(database);
      await setup(database, tasks().table, 'persistent');
      expect(await everything(database)).toEqual(recorded);
    });

    it('never wipe a table another setup made persistent meanwhile', async () => {
      const database = makeDriver();
      const before = tasks();
      await setup(database, before.table, 'disposable');
      await insertTask(database, before);

      // Right after the stale setup reads `__snapshot`, a newer one promotes
      // the table and writes a row the stale setup has never seen.
      let raced = false;
      const racing: SQLiteDriver = {
        ...database,
        all: (sql, parameters) =>
          database.all(sql, parameters).pipe(
            Effect.tap(() =>
              raced || !(parameters ?? []).includes('__snapshot')
                ? Effect.void
                : Effect.promise(async () => {
                    raced = true;
                    await setup(database, before.table, 'persistent');
                    await insertTask(database, before, 't2');
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
});
