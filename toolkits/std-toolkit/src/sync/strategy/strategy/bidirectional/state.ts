import { Schema } from 'effect';
import { SliceSchema } from '../slice-coverage.js';

export const BidirectionalStateSchema = Schema.Struct({
  slices: Schema.Array(SliceSchema),
});

export type BidirectionalState = typeof BidirectionalStateSchema.Type;
