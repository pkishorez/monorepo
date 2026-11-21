import { Effect, Exit, Logger, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../eschema/index.js';
import { StdTable } from '../../../db/index.js';
import type { SQLiteDriver } from '../../../db/sqlite/database/index.js';
import { SQLite, type TableMode } from '../../../db/sqlite/index.js';
import { inMemoryDrivers } from '../../../db/sqlite/__tests__/drivers.js';
import { TableSnapshot } from '../../../snapshot/index.js';
import {
  decodeStoredSnapshot,
  joinTableSnapshot,
  readStoredSnapshot,
} from '../../../db/table-snapshot/index.js';
import { StdTableService } from '../../../db/std-table/contract/index.js';
import { LegacySQL } from '../legacy.js';

const TaskV1 = EntityESchema.make('Task', 'taskId', {
  title: Schema.String,
}).build();
// Editing a shipped version is breaking: rows stored under it may not read.
const TaskEdited = EntityESchema.make('Task', 'taskId', {
  title: Schema.String.check(Schema.isMaxLength(3)),
}).build();

const tasks = (schema = TaskV1) => {
  const table = StdTable.make('tasks')
    .primary('pk', 'sk')
    .gsi('GSI1', 'GSI1PK', 'GSI1SK')
    .build();
  return { table, task: table.entity(schema).primary().build() };
};

type Tasks = ReturnType<typeof tasks>;

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

const query = (database: SQLiteDriver, sql: string) => run(database.all(sql));

/** The snapshot an earlier release recorded: it had no internal entities. */
const oldSnapshot = (code: Tasks) => {
  const snapshot = TableSnapshot.capture(code.table);
  return JSON.stringify(
    Effect.runSync(
      TableSnapshot.serialize({
        ...snapshot,
        entities: snapshot.entities.filter(
          ({ name }) => !name.startsWith('__'),
        ),
        schemas: snapshot.schemas.filter(
          ({ identity }) => !identity.startsWith('__'),
        ),
      }),
    ),
  );
};

/**
 * A database as the earlier release left it: the table and its index, a row,
 * and the table's `_std_contract` row.
 */
const oldDatabase = async (
  database: SQLiteDriver,
  options: {
    readonly mode?: TableMode;
    readonly code?: Tasks;
    readonly row?: readonly [string, string, string, string];
    /** Whether to write the app's row too. */
    readonly withRows?: boolean;
  } = {},
) => {
  const code = options.code ?? tasks();
  await run(
    database.run(
      'CREATE TABLE IF NOT EXISTS "tasks" ("pk" TEXT NOT NULL, "sk" TEXT NOT NULL, _e TEXT NOT NULL, _v TEXT NOT NULL, _u TEXT NOT NULL, _d INTEGER NOT NULL CHECK (_d IN (0, 1)), data TEXT NOT NULL, "GSI1PK" TEXT, "GSI1SK" TEXT, PRIMARY KEY ("pk", "sk"))',
    ),
  );
  await run(
    database.run(
      'CREATE INDEX IF NOT EXISTS "idx_tasks_GSI1" ON "tasks" ("GSI1PK", "GSI1SK")',
    ),
  );
  if (options.withRows ?? true)
    await run(
      code.task
        .insert({ taskId: 't1', title: 'Write' })
        .pipe(Effect.provide(SQLite.make(code.table, { database }).layer)),
    );
  await run(database.run(LegacySQL.create));
  await run(
    database.run(
      LegacySQL.insert,
      options.row ?? [
        'tasks',
        options.mode ?? 'persistent',
        'old-hash',
        oldSnapshot(code),
      ],
    ),
  );
};

const setup = (
  database: SQLiteDriver,
  code: Tasks,
  mode: TableMode,
  logs: string[] = [],
) =>
  run(
    Effect.exit(SQLite.setup(code.table, { database, mode })).pipe(
      Effect.provide(
        Logger.layer([
          Logger.make(({ logLevel, message }) =>
            logs.push(`${logLevel}: ${String(message)}`),
          ),
        ]),
      ),
    ),
  );

const legacyTable = (database: SQLiteDriver) =>
  query(
    database,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_std_contract'",
  );

const legacyRows = (database: SQLiteDriver) =>
  query(database, 'SELECT table_name FROM _std_contract ORDER BY table_name');

const appRows = async (database: SQLiteDriver) =>
  Number(
    (
      await query(
        database,
        "SELECT count(*) AS n FROM tasks WHERE substr(_e, 1, 2) <> '__'",
      )
    )[0]?.n,
  );

/** The snapshot and mode the table keeps in its internal entities. */
const stored = (database: SQLiteDriver, code: Tasks) =>
  run(
    Effect.gen(function* () {
      const { contract } = yield* StdTableService('tasks');
      const values = yield* readStoredSnapshot(contract).pipe(
        Effect.flatMap(decodeStoredSnapshot),
      );
      return values === undefined
        ? undefined
        : yield* joinTableSnapshot(values);
    }).pipe(Effect.provide(SQLite.make(code.table, { database }).layer)),
  );

const failure = (exit: Exit.Exit<void, unknown>) =>
  Exit.isFailure(exit)
    ? exit.cause.reasons.find((reason) => reason._tag === 'Fail')?.error
    : undefined;

describe.each(inMemoryDrivers)(
  'the 2026-11 stored-contract migration on %s',
  (_, makeDriver) => {
    it('moves the old row into the table, drops _std_contract, and keeps the rows', async () => {
      const database = makeDriver();
      await oldDatabase(database);
      const logs: string[] = [];

      expect(failure(await setup(database, tasks(), 'persistent', logs))).toBe(
        undefined,
      );

      expect(await legacyTable(database)).toEqual([]);
      expect(await appRows(database)).toBe(1);
      expect(await stored(database, tasks())).toEqual({
        snapshot: TableSnapshot.capture(tasks().table),
        mode: 'persistent',
        localIndexOrder: [],
      });
      expect(logs.join('\n')).toMatch(/moved the stored contract/);
    });

    it('checks the code against the moved snapshot, so a breaking change is still refused', async () => {
      const database = makeDriver();
      await oldDatabase(database);

      const exit = await setup(database, tasks(TaskEdited), 'persistent');

      expect(failure(exit)).toMatchObject({
        _tag: 'SetupRefused',
        reason: 'breaking',
      });
      expect(await appRows(database)).toBe(1);
      expect(await legacyTable(database)).toEqual([]);
      // The old snapshot is the table's now; without the internal entities,
      // which the next setup adds.
      const recorded = await stored(database, tasks());
      expect(recorded?.snapshot.entities.map(({ name }) => name)).toEqual([
        'Task',
      ]);
      expect(failure(await setup(database, tasks(), 'persistent'))).toBe(
        undefined,
      );
    });

    it('drops a row that does not read with a warning, and goes on as a table with no snapshot', async () => {
      const database = makeDriver();
      await oldDatabase(database, {
        row: ['tasks', 'persistent', 'old-hash', '{not json'],
      });
      const logs: string[] = [];

      expect(failure(await setup(database, tasks(), 'persistent', logs))).toBe(
        undefined,
      );

      expect(logs.join('\n')).toMatch(
        /Warn.*dropped the stored contract of SQLite table "tasks"/,
      );
      expect(await legacyTable(database)).toEqual([]);
      // Persistent with rows and no snapshot: the rows are kept.
      expect(await appRows(database)).toBe(1);
      expect((await stored(database, tasks()))?.mode).toBe('persistent');
    });

    it('drops a row with a mode it does not know', async () => {
      const database = makeDriver();
      await oldDatabase(database, {
        row: ['tasks', 'forever', 'old-hash', oldSnapshot(tasks())],
      });

      expect(failure(await setup(database, tasks(), 'persistent'))).toBe(
        undefined,
      );
      expect(await legacyTable(database)).toEqual([]);
      expect(await appRows(database)).toBe(1);
    });

    it('only cleans up a leftover row when the table migrated already', async () => {
      const database = makeDriver();
      expect(failure(await setup(database, tasks(), 'persistent'))).toBe(
        undefined,
      );
      const before = await stored(database, tasks());
      // A leftover row holding a snapshot the code would break.
      await oldDatabase(database, {
        withRows: false,
        row: [
          'tasks',
          'persistent',
          'old-hash',
          oldSnapshot(tasks(TaskEdited)),
        ],
      });

      expect(failure(await setup(database, tasks(), 'persistent'))).toBe(
        undefined,
      );
      expect(await legacyTable(database)).toEqual([]);
      expect(await stored(database, tasks())).toEqual(before);
    });

    it('keeps _std_contract while another table still has a row, matching names in any case', async () => {
      const database = makeDriver();
      await oldDatabase(database, {
        row: ['TASKS', 'persistent', 'old-hash', oldSnapshot(tasks())],
      });
      await run(
        database.run(LegacySQL.insert, [
          'other',
          'persistent',
          'old-hash',
          '{}',
        ]),
      );

      expect(failure(await setup(database, tasks(), 'persistent'))).toBe(
        undefined,
      );

      expect(await legacyRows(database)).toEqual([{ table_name: 'other' }]);
      expect((await stored(database, tasks()))?.mode).toBe('persistent');
    });

    it('migrates a disposable table, which is then wiped by a breaking change', async () => {
      const database = makeDriver();
      await oldDatabase(database, { mode: 'disposable' });

      expect(failure(await setup(database, tasks(), 'disposable'))).toBe(
        undefined,
      );
      expect(await legacyTable(database)).toEqual([]);
      expect(await appRows(database)).toBe(1);
      expect((await stored(database, tasks()))?.mode).toBe('disposable');

      expect(
        failure(await setup(database, tasks(TaskEdited), 'disposable')),
      ).toBe(undefined);
      expect(await appRows(database)).toBe(0);
    });

    it('refuses a persistent table becoming disposable after it moved', async () => {
      const database = makeDriver();
      await oldDatabase(database);

      expect(
        failure(await setup(database, tasks(), 'disposable')),
      ).toMatchObject({ _tag: 'SetupRefused', reason: 'mode-change' });
      expect(await appRows(database)).toBe(1);
    });

    describe('stopped midway', () => {
      /** The driver, failing every statement matching `stop` once `after` of them ran. */
      const stopping = (
        database: SQLiteDriver,
        stop: (sql: string) => boolean,
        after: number,
      ): SQLiteDriver => {
        let seen = 0;
        return {
          ...database,
          run: (sql, parameters) =>
            stop(sql) && seen++ >= after
              ? Effect.fail(new Error('stopped'))
              : database.run(sql, parameters),
        };
      };

      it.each([0, 1, 2])(
        'after %i snapshot writes, is completed by the next setup',
        async (after) => {
          const database = makeDriver();
          await oldDatabase(database);
          const exit = await setup(
            stopping(
              database,
              (sql) => sql.startsWith('INSERT INTO "tasks"'),
              after,
            ),
            tasks(),
            'persistent',
          );
          expect(Exit.isFailure(exit)).toBe(true);
          expect(await legacyRows(database)).toEqual([{ table_name: 'tasks' }]);

          // Rerun with a breaking change: the old snapshot still guards.
          expect(
            failure(await setup(database, tasks(TaskEdited), 'persistent')),
          ).toMatchObject({ reason: 'breaking' });
          expect(await legacyTable(database)).toEqual([]);
          expect(failure(await setup(database, tasks(), 'persistent'))).toBe(
            undefined,
          );
          expect(await appRows(database)).toBe(1);
        },
      );

      it('before the row is deleted, is cleaned up by the next setup', async () => {
        const database = makeDriver();
        await oldDatabase(database);
        const exit = await setup(
          stopping(database, (sql) => sql.startsWith('DELETE FROM "_std'), 0),
          tasks(),
          'persistent',
        );
        expect(Exit.isFailure(exit)).toBe(true);
        expect((await stored(database, tasks()))?.mode).toBe('persistent');

        expect(failure(await setup(database, tasks(), 'persistent'))).toBe(
          undefined,
        );
        expect(await legacyTable(database)).toEqual([]);
      });
    });
  },
);
