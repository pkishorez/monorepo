import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import envPaths from 'env-paths';
import { Context, Effect, Layer } from 'effect';
import { StdTable } from 'std-toolkit/db';
import { SQLite, type SQLiteTable } from 'std-toolkit/db/sqlite';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import { MachineSchema } from '../../domain/machine/index.js';
import { MessageSchema } from '../../domain/message/index.js';
import { RunSchema } from '../../domain/run/index.js';
import { ThreadSchema } from '../../domain/thread/index.js';

export const DEFAULT_DB_PATH = join(
  envPaths('whatever', { suffix: '' }).data,
  'whatever.sqlite',
);

export const DEFAULT_TABLE_NAME = 'code_data';

export interface DbOptions {
  readonly dbPath?: string;
  readonly tableName?: string;
}

const table = StdTable.make('code')
  .primary('pk', 'sk')
  .gsi('machine-primary', 'machinePk', 'machineSk')
  .build();
const machine = table
  .entity(MachineSchema)
  .primary()
  .index('machine-primary', 'all', { pk: [] })
  .build();
const thread = table.entity(ThreadSchema).primary().build();
const run = table
  .entity(RunSchema)
  .primary({ pk: ['threadId'] })
  .build();
const message = table
  .entity(MessageSchema)
  .primary({ pk: ['threadId'] })
  .build();

const makeDatabaseService = (configured: SQLiteTable<'code'>) => {
  const provideTable = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provide(effect, configured.layer);
  return {
    table: {
      transact: (operations: Parameters<typeof table.transact>[0]) =>
        provideTable(table.transact(operations)).pipe(
          Effect.withSpan('code.db.transaction', {
            attributes: { 'db.operation_count': operations.length },
          }),
        ),
    },
    machine: {
      ...machine,
      get: (...args: Parameters<typeof machine.get>) =>
        provideTable(machine.get(...args)),
      insert: (...args: Parameters<typeof machine.insert>) =>
        provideTable(machine.insert(...args)),
      query: (...args: Parameters<typeof machine.query>) =>
        provideTable(machine.query(...args)),
    },
    thread: {
      ...thread,
      get: (...args: Parameters<typeof thread.get>) =>
        provideTable(thread.get(...args)),
      insertOp: (...args: Parameters<typeof thread.insertOp>) =>
        provideTable(thread.insertOp(...args)),
      getAndUpdateOp: (...args: Parameters<typeof thread.getAndUpdateOp>) =>
        provideTable(thread.getAndUpdateOp(...args)),
    },
    run: {
      ...run,
      get: (...args: Parameters<typeof run.get>) =>
        provideTable(run.get(...args)),
      insertOp: (...args: Parameters<typeof run.insertOp>) =>
        provideTable(run.insertOp(...args)),
      getAndUpdateOp: (...args: Parameters<typeof run.getAndUpdateOp>) =>
        provideTable(run.getAndUpdateOp(...args)),
    },
    message: {
      ...message,
      insertOp: (...args: Parameters<typeof message.insertOp>) =>
        provideTable(message.insertOp(...args)),
    },
  };
};

type DatabaseService = ReturnType<typeof makeDatabaseService>;

/** @internal */
export class Db extends Context.Service<Db, DatabaseService>()('code/Db') {}

/** @internal */
export const makeDbLayer = (options: DbOptions = {}) => {
  const dbPath = options.dbPath ?? DEFAULT_DB_PATH;
  const tableName = options.tableName ?? DEFAULT_TABLE_NAME;
  return Layer.unwrap(
    Effect.gen(function* () {
      const database = yield* Effect.acquireRelease(
        Effect.sync(() => {
          if (dbPath !== ':memory:')
            mkdirSync(dirname(dbPath), { recursive: true });
          return makeNodeSQLite({ path: dbPath });
        }),
        (driver) => Effect.sync(() => driver.close?.()),
      );
      const configured = SQLite.make(table, { database, tableName });
      const service = configured.setup.pipe(
        Effect.mapError(
          (cause) => new Error('Failed to set up code database', { cause }),
        ),
        Effect.as(makeDatabaseService(configured)),
      );
      return Layer.effect(Db, service).pipe(Layer.provide(configured.layer));
    }),
  );
};
