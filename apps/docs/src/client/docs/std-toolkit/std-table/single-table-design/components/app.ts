import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { ESchema, EntityESchema } from '@kestack/std-toolkit/eschema';

// The three shapes of the task board.
const Board = EntityESchema.make('Board', 'boardId', {
  name: Schema.String,
}).build();
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();
const Settings = ESchema.make('Settings', {
  theme: Schema.Literals(['light', 'dark']),
}).build();

// One table for the whole app: a name, and its two key columns.
export const table = StdTable.make('board').primary('pk', 'sk').build();

// Every kind bound to that one table. Each says which of its fields
// make its keys; std-toolkit writes the keys themselves.
export const board = table.entity(Board).primary().build();
export const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();
export const settings = table
  .singleEntity(Settings)
  .default({ theme: 'light' });
