import { Schema } from 'effect';
import { ESchema } from '@kestack/std-toolkit/eschema';
import { table } from '../../board/board.ts';

// Settings have no id, since there is only one: a plain ESchema.
export const Settings = ESchema.make('Settings', {
  theme: Schema.Literals(['light', 'dark']),
  weekStartsOn: Schema.Literals(['monday', 'sunday']),
}).build();

// Kept in the same table as the tasks, with the value it has until saved.
export const settings = table
  .singleEntity(Settings)
  .default({ theme: 'light', weekStartsOn: 'monday' });

export { table };
