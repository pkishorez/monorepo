import { Schema } from 'effect';
import { ESchema } from '@kestack/std-toolkit/eschema';

// Release 1 of the app: a task has a title.
export const TaskV1 = ESchema.make('Task', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

// Release 2 adds a priority. Tasks saved before it read as 'low'.
export const Task = ESchema.make('Task', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .build();
