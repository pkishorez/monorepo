import { Schema } from 'effect';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

// The same task as an EntityESchema: one more argument, the id field.
export const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .build();
