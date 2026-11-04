import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/schema';

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

// Each release declares its Task on the same table, 'board'.
export const release1 = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(TaskV1, (e) => e.primary({ pk: ['boardId'] }))
  .build().Task;
export const table = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
  .build();
export const release2 = table.Task;
