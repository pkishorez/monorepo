import { Schema } from 'effect';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

// A task: its name, its id field, and its fields.
export const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();
