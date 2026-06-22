import { Schema } from 'effect';
import { SliceSchema } from '../slices/index.js';

export const BidirectionalStateSchema = Schema.Struct({
  slices: Schema.Array(SliceSchema),
});

export type BidirectionalState = typeof BidirectionalStateSchema.Type;
