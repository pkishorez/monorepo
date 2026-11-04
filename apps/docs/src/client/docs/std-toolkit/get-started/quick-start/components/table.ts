import { StdTable } from '@kestack/std-toolkit/db';
import { Task } from './task.ts';

// One table, with a partition key and a sort key, and Task declared on it:
// tasks on the same board share a partition.
export const table = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
  .build();

// The built table carries the entity under its name.
export const task = table.Task;
