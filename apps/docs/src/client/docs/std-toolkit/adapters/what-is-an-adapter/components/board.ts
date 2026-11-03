import { Effect, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
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

// Save two tasks, then list the board. Nothing here names a database:
// its type says only that it needs the table called 'board'.
//   Effect<Array<Entity<Task>>, DatabaseError, StdTableService<'board'>>
export const saveAndList = Effect.gen(function* () {
  yield* task.insert({ boardId: 'work', taskId: 't1', title: 'Plan the week' });
  yield* task.insert({
    boardId: 'work',
    taskId: 't2',
    title: 'Water the plants',
  });
  const page = yield* task.query('primary', {
    pk: { boardId: 'work' },
    '>=': null,
  });
  return page.items;
});
