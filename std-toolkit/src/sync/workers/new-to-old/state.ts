import { Schema } from 'effect';
import { SliceSchema } from '../../domain/slice-coverage/index.js';

export const NewToOldStateSchema = Schema.Struct({
  slices: Schema.Array(SliceSchema),
  reachedOldest: Schema.Boolean,
});

export type NewToOldState = typeof NewToOldStateSchema.Type;
