import { Schema } from 'effect';
import { ESchema } from '@kestack/std-toolkit/schema';

// The task as you know it so far: a name, its fields, its versions.
export const TaskShape = ESchema.make('Task', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .build();
