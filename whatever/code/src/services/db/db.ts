import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import envPaths from 'env-paths';
import { Context, Effect, Layer } from 'effect';
import { SQLiteTable } from 'std-toolkit/sqlite';
import { nodeSqliteLayer } from 'std-toolkit/sqlite/adapters/node';
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
  dbPath?: string;
  tableName?: string;
  database?: DatabaseSync;
  closeDatabase?: boolean;
}

const ensureDbParent = (dbPath: string) => {
  if (dbPath === ':memory:') return;
  mkdirSync(dirname(dbPath), { recursive: true });
};

const makeDatabase = (options: DbOptions) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      if (options.database) return options.database;
      const dbPath = options.dbPath ?? DEFAULT_DB_PATH;
      ensureDbParent(dbPath);
      return new DatabaseSync(dbPath);
    }),
    (database) =>
      Effect.sync(() => {
        const shouldClose = options.database
          ? options.closeDatabase === true
          : options.closeDatabase !== false;
        if (shouldClose) database.close();
      }),
  );

const dbEffect = Effect.gen(function* () {
  const table = SQLiteTable.make().primary('pk', 'sk').build();
  const machine = table.entity(MachineSchema).primary().build();
  const thread = table.entity(ThreadSchema).primary().build();
  const run = table
    .entity(RunSchema)
    .primary({ pk: ['threadId'] })
    .build();
  const message = table
    .entity(MessageSchema)
    .primary({ pk: ['threadId'] })
    .build();

  yield* table.setup();
  return {
    table: {
      transact: (ops: Parameters<typeof table.transact>[0]) =>
        table.transact(ops).pipe(
          Effect.withSpan('code.db.transaction', {
            attributes: { 'db.operation_count': ops.length },
          }),
        ),
    },
    machine,
    thread,
    run,
    message,
  };
});

export class Db extends Context.Service<Db, Effect.Success<typeof dbEffect>>()(
  'code/Db',
) {}

export const makeDbLayer = (options: DbOptions = {}) => {
  const sqliteLayer = Layer.unwrap(
    makeDatabase(options).pipe(
      Effect.map((database) =>
        nodeSqliteLayer(database, options.tableName ?? DEFAULT_TABLE_NAME),
      ),
    ),
  );

  return Layer.effect(Db, dbEffect).pipe(Layer.provideMerge(sqliteLayer));
};
