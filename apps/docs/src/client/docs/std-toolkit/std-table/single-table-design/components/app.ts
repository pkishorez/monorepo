import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { ESchema, EntityESchema } from '@kestack/std-toolkit/schema';

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

// One table for the whole app: a name, its two key columns, and every
// kind declared on it. Each says which of its fields make its keys;
// std-toolkit writes the keys themselves.
export const table = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Board, (e) => e.primary())
  .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
  .singleEntity(Settings, { default: { theme: 'light' } })
  .build();

// The built table carries each kind under its name.
export const board = table.Board;
export const task = table.Task;
export const settings = table.Settings;
