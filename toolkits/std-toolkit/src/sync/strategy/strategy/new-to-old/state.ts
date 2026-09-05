import { Schema } from 'effect';
import { SliceSchema } from '../slice-coverage.js';

export const NewToOldStateSchema = Schema.Struct({
  slices: Schema.Array(SliceSchema),
  reachedOldest: Schema.Boolean,
});

export type NewToOldState = typeof NewToOldStateSchema.Type;
