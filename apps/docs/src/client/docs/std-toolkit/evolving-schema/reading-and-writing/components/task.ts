import { Schema } from 'effect';
import { ESchema } from '@kestack/std-toolkit/schema';

// One shape, every version it has ever had.
export const Task = ESchema.make('Task', {
  boardId: Schema.String,
  title: Schema.String,
})
  // v2: tasks get a priority. Tasks saved before read as 'low'.
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  // v3: tasks can be done. Tasks saved before read as not done.
  .evolve('v3', { done: Schema.Boolean }, (v2) => ({ ...v2, done: false }))
  .build();
