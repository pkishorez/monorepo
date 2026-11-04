import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { ESchema } from '@kestack/std-toolkit/schema';
import { Task } from '../../board/board.ts';

// Settings have no id, since there is only one: a plain ESchema.
export const Settings = ESchema.make('Settings', {
  theme: Schema.Literals(['light', 'dark']),
  weekStartsOn: Schema.Literals(['monday', 'sunday']),
}).build();

// Declared in the same table as the tasks, with the value it has until saved.
export const table = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
  .singleEntity(Settings, {
    default: { theme: 'light', weekStartsOn: 'monday' },
  })
  .build();

export const settings = table.Settings;
