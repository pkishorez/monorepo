import { Effect, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

export const table = StdTable.make('board').primary('pk', 'sk').build();
export const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

// One connection to one IndexedDB database. Several tables can share it;
// each gets a store of its own.
const database = IDB.database({ databaseName: 'my-app' });

export const board = IDB.make(table, {
  database,
  // Tasks are fetched from the server again, so this copy may be thrown
  // away when a change would break it.
  mode: 'disposable',
});

// The same program as on Memory: only the layer is new.
export const titles = task
  .query('primary', { pk: { boardId: 'work' }, '>=': null })
  .pipe(
    Effect.map((page) => page.items.map((item) => item.value.title)),
    Effect.provide(board.layer),
  );
