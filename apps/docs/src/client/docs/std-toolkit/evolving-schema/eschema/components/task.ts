import { Schema } from 'effect';
import { ESchema } from '@kestack/std-toolkit/eschema';

// A task's shape: a name, and its fields.
export const Task = ESchema.make('Task', {
  boardId: Schema.String,
  title: Schema.String,
}).build();
