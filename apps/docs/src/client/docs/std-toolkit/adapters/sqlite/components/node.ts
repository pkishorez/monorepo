import { Effect, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { EntityESchema } from '@kestack/std-toolkit/schema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

const table = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
  .build();
const task = table.Task;

// The driver: Node's built-in node:sqlite, on a file.
const database = makeNodeSQLite({ path: './board.db' });

export const main = Effect.gen(function* () {
  // Once, when the process starts: create or update the table.
  yield* SQLite.setup(table, { database, mode: 'persistent' });

  // Then the same program as anywhere else, on this layer.
  const sqlite = SQLite.make(table, { database });
  yield* task
    .insert({ boardId: 'work', taskId: 't1', title: 'Plan the week' })
    .pipe(Effect.provide(sqlite.layer));
}).pipe(Effect.ensuring(Effect.sync(() => database.close?.())));
