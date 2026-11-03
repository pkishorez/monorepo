import { Schema } from 'effect';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

// A task: its id is `taskId`, and it sits on a board.
export const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
}).build();
