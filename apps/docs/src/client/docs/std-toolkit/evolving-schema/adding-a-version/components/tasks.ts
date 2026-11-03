import { Effect, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

// Release 1 of the app: a task has a title.
export const TaskV1 = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

// Release 2 adds a priority. Tasks saved before it get 'low'.
export const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .build();

// Each release defines the same table, 'board', and binds its own Task to
// it. Both run against the one table the page keeps in memory.
const releaseOneTable = StdTable.make('board').primary('pk', 'sk').build();
export const release1 = releaseOneTable
  .entity(TaskV1)
  .primary({ pk: ['boardId'] })
  .build();

export const table = StdTable.make('board').primary('pk', 'sk').build();
export const release2 = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

// Every task on the board, as release 2 reads it.
export const board = release2
  .query('primary', { pk: { boardId: 'work' }, '>=': null })
  .pipe(Effect.map((page) => page.items.map((item) => item.value)));
