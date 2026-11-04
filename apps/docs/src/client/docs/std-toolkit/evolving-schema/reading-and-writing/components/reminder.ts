import { Schema } from 'effect';
import { ESchema } from '@kestack/std-toolkit/schema';

// A field whose value is a Date in your code, and a string when stored.
export const Reminder = ESchema.make('Reminder', {
  title: Schema.String,
  dueAt: Schema.DateFromString,
}).build();
