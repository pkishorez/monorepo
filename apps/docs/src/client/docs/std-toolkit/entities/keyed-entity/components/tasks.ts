import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

// The shape of a task, as on the last Part's pages.
export const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
}).build();

// A table to keep it in. The next Part, StdTable, is about this line.
export const table = StdTable.make('board').primary('pk', 'sk').build();

// Task bound to the table: every task on a board shares its boardId.
export const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();
