import { Schema } from 'effect';
import { SliceSchema } from '../slices/index.js';

export const NewToOldStateSchema = Schema.Struct({
  slices: Schema.Array(SliceSchema),
  reachedOldest: Schema.Boolean,
});

export type NewToOldState = typeof NewToOldStateSchema.Type;
