import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/schema';

// The Task you built in Evolving schema, with all three versions.
export const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .evolve('v3', { done: Schema.Boolean }, (v2) => ({ ...v2, done: false }))
  .build();

// A table to keep it in, with Task declared on it: that makes the entity.
// Tasks on one board sit together. The StdTable Part is all about the table.
export const table = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
  .build();

// The built table carries the entity under its name.
export const task = table.Task;
