import { Effect, Exit, Schema, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../eschema/index.js';
import { StdTable } from '../../index.js';
import type { SQLiteDriver } from '../database/index.js';
import { makeBetterSQLite3 } from '../drivers/better-sqlite3/index.js';
import { makeNodeSQLite } from '../drivers/node/index.js';
import { SetupRefused, SQLite, type TableMode } from '../index.js';

const TaskV1 = EntityESchema.make('Task', 'taskId', {
  title: Schema.String,
}).build();
// Editing a shipped version is breaking: rows stored under it may not read.
const TaskEdited = EntityESchema.make('Task', 'taskId', {
  title: Schema.String.check(Schema.isMaxLength(3)),
}).build();
const TaskV2 = EntityESchema.make('Task', 'taskId', {
  title: Schema.String,
})
  .evolve('v2', { owner: Schema.String }, (v1) => ({ ...v1, owner: 'ann' }))
  .build();

const plain = (schema: typeof TaskV1 = TaskV1) =>
  StdTable.make('tasks')
    .primary('pk', 'sk')
    .gsi('GSI1', 'GSI1PK', 'GSI1SK')
    .entity(schema, (e) => e.primary())
    .build();

const indexed = () =>
  StdTable.make('tasks')
    .primary('pk', 'sk')
    .gsi('GSI1', 'GSI1PK', 'GSI1SK')
    .entity(TaskV1, (e) =>
      e.primary().index('GSI1', 'byTitle', { pk: ['title'] }),
    )
    .build();

const withOwner = () =>
  StdTable.make('tasks')
    .primary('pk', 'sk')
    .gsi('GSI1', 'GSI1PK', 'GSI1SK')
    .entity(TaskV2, (e) => e.primary())
    .build();

type AnyTable = Parameters<typeof SQLite.setup>[0];

const drivers: readonly [string, () => SQLiteDriver][] = [
  ['node', () => makeNodeSQLite({ path: ':memory:' })],
  ['better-sqlite3', () => makeBetterSQLite3({ path: ':memory:' })],
];

const refusal = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit)
    ? (exit.cause.reasons.find((reason) => reason._tag === 'Fail')
        ?.error as SetupRefused)
    : undefined;

describe.each(drivers)('SQLite setup on %s', (_, open) => {
  const harness = () => {
    const database = open();
    const setup = (table: AnyTable, mode: TableMode) =>
      Effect.runPromise(Effect.exit(SQLite.setup(table, { database, mode })));
    const outcome = async (table: AnyTable, mode: TableMode) => {
      const exit = await setup(table, mode);
      if (Exit.isFailure(exit)) throw new Error(String(exit.cause));
      return exit.value.kind;
    };
    const insert = (taskId = 't1', table = plain()) =>
      Effect.runPromise(
        table.Task.insert({ taskId, title: 'Write' }).pipe(
          Effect.provide(SQLite.make(table, { database }).layer),
        ),
      );
    const all = (sql: string) => Effect.runPromise(database.all(sql));
    const reserved = "_e LIKE '\\_std\\_%' ESCAPE '\\'";
    const dropContract = () =>
      Effect.runPromise(database.run(`DELETE FROM tasks WHERE ${reserved}`));
    const tasks = () =>
      all("SELECT _v, data FROM tasks WHERE _e = 'Task' ORDER BY sk");
    const contractRows = async () =>
      Number(
        (await all(`SELECT count(*) AS n FROM tasks WHERE ${reserved}`))[0]?.n,
      );
    const tables = async () =>
      (
        await all(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
      ).map(({ name }) => name);
    return {
      database,
      setup,
      outcome,
      insert,
      all,
      dropContract,
      tasks,
      contractRows,
      tables,
    };
  };

  it('creates a fresh table and keeps its contract inside it', async () => {
    const db = harness();
    expect(await db.outcome(plain(), 'persistent')).toBe('created');
    expect(await db.tables()).toEqual(['tasks']);
    expect(await db.contractRows()).toBeGreaterThan(0);
    // Reserved rows never reach a scan.
    const table = plain();
    const scanned = await Effect.runPromise(
      Stream.runCollect(table.scan()).pipe(
        Effect.provide(SQLite.make(table, { database: db.database }).layer),
      ),
    );
    expect(Array.from(scanned)).toEqual([]);
  });

  it('leaves an unchanged table as it is', async () => {
    const db = harness();
    await db.outcome(plain(), 'persistent');
    await db.insert();
    expect(await db.outcome(plain(), 'persistent')).toBe('unchanged');
    expect(await db.tasks()).toHaveLength(1);
  });

  it('takes a new version without rewriting the rows stored before it', async () => {
    const db = harness();
    await db.outcome(plain(), 'persistent');
    await db.insert();
    const exit = await db.setup(withOwner(), 'persistent');
    expect(Exit.isSuccess(exit) && exit.value).toEqual({
      kind: 'applied',
      changes: expect.any(Array),
      reindexed: [],
    });
    const [row] = await db.tasks();
    expect(row?._v).toBe('v1');
    expect(await db.outcome(withOwner(), 'persistent')).toBe('unchanged');
  });

  it('creates a new index and reindexes old rows into it', async () => {
    const db = harness();
    await db.outcome(plain(), 'persistent');
    await db.insert();
    const table = indexed();
    expect(await db.outcome(table, 'persistent')).toBe('applied');
    const indexes = await db.all('PRAGMA index_list("tasks")');
    expect(indexes.map(({ name }) => name)).toContain('idx_tasks_GSI1');
    const found = await Effect.runPromise(
      table.Task.query('byTitle', { pk: { title: 'Write' }, '>=': null }).pipe(
        Effect.provide(SQLite.make(table, { database: db.database }).layer),
      ),
    );
    expect(found.items.map(({ value }) => value.taskId)).toEqual(['t1']);
  });

  it('drops the index setup made once the table no longer declares it', async () => {
    const db = harness();
    await db.outcome(indexed(), 'disposable');
    expect(
      (await db.all('PRAGMA index_list("tasks")')).map(({ name }) => name),
    ).toContain('idx_tasks_GSI1');
    const bare = StdTable.make('tasks')
      .primary('pk', 'sk')
      .entity(TaskV1, (e) => e.primary())
      .build();
    await db.outcome(bare, 'disposable');
    expect(
      (await db.all('PRAGMA index_list("tasks")')).map(({ name }) => name),
    ).not.toContain('idx_tasks_GSI1');
  });

  describe('a persistent table', () => {
    it('refuses a breaking change and keeps every row', async () => {
      const db = harness();
      await db.outcome(plain(), 'persistent');
      await db.insert();
      const exit = await db.setup(plain(TaskEdited), 'persistent');
      expect(refusal(exit)).toBeInstanceOf(SetupRefused);
      expect(refusal(exit)?.reason).toBe('breaking');
      expect(refusal(exit)?.message).toMatch(/Task v1/);
      expect(await db.tasks()).toHaveLength(1);
      // The refusal changed nothing: the old contract is still the one stored.
      expect(await db.outcome(plain(), 'persistent')).toBe('unchanged');
    });

    it('can never become disposable', async () => {
      const db = harness();
      await db.outcome(plain(), 'persistent');
      await db.insert();
      const exit = await db.setup(plain(), 'disposable');
      expect(refusal(exit)?.reason).toBe('mode-change');
      expect(await db.tasks()).toHaveLength(1);
    });

    it('refuses a table that holds rows but no contract', async () => {
      const db = harness();
      await db.outcome(plain(), 'persistent');
      await db.insert();
      await db.dropContract();
      const exit = await db.setup(plain(), 'persistent');
      expect(refusal(exit)?.reason).toBe('no-contract');
      expect(await db.tasks()).toHaveLength(1);
    });

    it('is the same table under another letter case', async () => {
      const db = harness();
      await db.outcome(plain(), 'persistent');
      await db.insert();
      const exit = await Effect.runPromise(
        Effect.exit(
          SQLite.setup(plain(TaskEdited), {
            database: db.database,
            mode: 'disposable',
            tableName: 'TASKS',
          }),
        ),
      );
      expect(refusal(exit)?.reason).toBe('mode-change');
      expect(await db.tasks()).toHaveLength(1);
    });

    it('refuses a caller the types do not reach that declares no mode', async () => {
      const db = harness();
      const exit = await db.setup(plain(), undefined as unknown as TableMode);
      expect(Exit.isFailure(exit) && String(exit.cause)).toMatch(/has no mode/);
    });
  });

  describe('a disposable table', () => {
    it('is wiped by an index change instead of reindexed', async () => {
      const db = harness();
      await db.outcome(plain(), 'disposable');
      await db.insert();
      expect(await db.outcome(indexed(), 'disposable')).toBe('wiped');
      expect(await db.tasks()).toEqual([]);
      // The new contract is recorded: what is written now is kept.
      const after = indexed();
      await Effect.runPromise(
        after.Task.insert({ taskId: 't2', title: 'Write' }).pipe(
          Effect.provide(SQLite.make(after, { database: db.database }).layer),
        ),
      );
      expect(await db.outcome(indexed(), 'disposable')).toBe('unchanged');
      expect(await db.tasks()).toHaveLength(1);
    });

    it('is wiped by a breaking change', async () => {
      const db = harness();
      await db.outcome(plain(), 'disposable');
      await db.insert();
      expect(await db.outcome(plain(TaskEdited), 'disposable')).toBe('wiped');
      expect(await db.tasks()).toEqual([]);
    });

    it('is wiped when it holds rows but no contract', async () => {
      const db = harness();
      await db.outcome(plain(), 'disposable');
      await db.insert();
      await db.dropContract();
      expect(await db.outcome(plain(), 'disposable')).toBe('wiped');
      expect(await db.tasks()).toEqual([]);
    });

    it('may become persistent, and is then guarded', async () => {
      const db = harness();
      await db.outcome(plain(), 'disposable');
      await db.insert();
      expect(await db.outcome(plain(), 'persistent')).toBe('applied');
      expect(await db.tasks()).toHaveLength(1);
      const exit = await db.setup(plain(TaskEdited), 'persistent');
      expect(refusal(exit)?.reason).toBe('breaking');
      expect(await db.tasks()).toHaveLength(1);
    });
  });

  describe('an old _std_contract table', () => {
    const leaveOldContract = async (database: SQLiteDriver) => {
      await Effect.runPromise(
        database.run(
          'CREATE TABLE _std_contract (table_name TEXT PRIMARY KEY NOT NULL COLLATE NOCASE, mode TEXT NOT NULL, hash TEXT NOT NULL, snapshot TEXT NOT NULL)',
        ),
      );
      await Effect.runPromise(
        database.run('INSERT INTO _std_contract VALUES (?, ?, ?, ?)', [
          'tasks',
          'persistent',
          'old-hash',
          '{}',
        ]),
      );
    };

    it('is ignored when a fresh table is set up', async () => {
      const db = harness();
      await leaveOldContract(db.database);
      expect(await db.outcome(plain(), 'disposable')).toBe('created');
      expect(await db.all('SELECT * FROM _std_contract')).toEqual([
        {
          table_name: 'tasks',
          mode: 'persistent',
          hash: 'old-hash',
          snapshot: '{}',
        },
      ]);
    });

    it('does not count as a contract for a table that holds rows', async () => {
      const db = harness();
      await db.outcome(plain(), 'persistent');
      await db.insert();
      await db.dropContract();
      await leaveOldContract(db.database);
      const exit = await db.setup(plain(), 'persistent');
      expect(refusal(exit)?.reason).toBe('no-contract');
    });

    it('may be a table name like any other', async () => {
      const db = harness();
      const exit = await Effect.runPromise(
        Effect.exit(
          SQLite.setup(plain(), {
            database: db.database,
            mode: 'persistent',
            tableName: '_std_contract',
          }),
        ),
      );
      expect(Exit.isSuccess(exit)).toBe(true);
    });
  });
});
