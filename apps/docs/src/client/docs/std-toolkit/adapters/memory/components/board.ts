import { Effect, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/schema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

export const table = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
  .build();
export const task = table.Task;

// The titles on the 'work' board, leaving out deleted tasks.
export const titles = task
  .query(
    'primary',
    { pk: { boardId: 'work' }, '>=': null },
    { excludeDeleted: true },
  )
  .pipe(Effect.map((page) => page.items.map((item) => item.value.title)));
