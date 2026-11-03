import { StdTable } from '@kestack/std-toolkit/db';
import { Task } from './task.ts';

// One table, with a partition key and a sort key.
export const table = StdTable.make('board').primary('pk', 'sk').build();

// Task bound to it: tasks on the same board share a partition.
export const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();
