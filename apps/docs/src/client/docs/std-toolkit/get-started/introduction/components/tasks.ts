import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

// 1. The shape: what a task is, described once.
export const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

// 2. The table every kind of thing shares, and Task bound to it.
export const table = StdTable.make('board').primary('pk', 'sk').build();
export const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();
