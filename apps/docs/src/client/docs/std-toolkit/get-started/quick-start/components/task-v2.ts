import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

// Task, given a second version: v2 adds a priority, and says what tasks
// saved at v1 get when they're read.
export const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .build();

// The same table, 'board', bound to the new Task.
export const table = StdTable.make('board').primary('pk', 'sk').build();
export const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();
