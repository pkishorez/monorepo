import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { ESchema, EntityESchema } from '@kestack/std-toolkit/eschema';

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

// One table for the whole app: a partition key and a sort key.
export const table = StdTable.make('app').primary('pk', 'sk').build();

// Three kinds of thing, each bound to the same table.
export const board = table.entity(Board).primary().build();
export const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();
export const settings = table
  .singleEntity(Settings)
  .default({ theme: 'light' });
