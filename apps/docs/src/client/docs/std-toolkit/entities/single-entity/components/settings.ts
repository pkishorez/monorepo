import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { ESchema } from '@kestack/std-toolkit/eschema';

// One record with no id: there is only ever one.
export const Settings = ESchema.make('Settings', {
  theme: Schema.Literals(['light', 'dark']),
  weekStartsOn: Schema.Literals(['monday', 'sunday']),
}).build();

// A table to keep it in, as on the last page.
export const table = StdTable.make('app').primary('pk', 'sk').build();

// Bound with the value it has until something is saved.
export const settings = table
  .singleEntity(Settings)
  .default({ theme: 'light', weekStartsOn: 'monday' });
