import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

// Release 1 of the app: a task has a title.
const TaskV1 = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

// Release 2 adds a priority, and says what old tasks get: 'low'.
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .build();

// Each release binds its Task to the same table, 'board'.
export const table = StdTable.make('board').primary('pk', 'sk').build();
export const release1 = StdTable.make('board')
  .primary('pk', 'sk')
  .build()
  .entity(TaskV1)
  .primary({ pk: ['boardId'] })
  .build();
export const release2 = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();
