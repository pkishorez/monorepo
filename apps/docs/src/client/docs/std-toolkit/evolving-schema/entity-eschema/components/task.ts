import { Schema } from 'effect';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

export const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  // A Date in your code, an ISO string when stored.
  dueAt: Schema.DateFromString,
  // No value is null, never a missing key.
  note: Schema.NullOr(Schema.String),
  // Numbers are finite: JSON has no NaN or Infinity.
  estimate: Schema.Finite,
}).build();
