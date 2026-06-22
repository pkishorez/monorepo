import { Schema } from 'effect';
import { MetaSchema } from '@std-toolkit/core';

const CursorSchema = Schema.Struct({
  value: Schema.Unknown,
  meta: MetaSchema,
});

const SliceSchema = Schema.Struct({
  low: CursorSchema,
  high: CursorSchema,
  itemCount: Schema.Number,
});

export const NewToOldStateSchema = Schema.Struct({
  slices: Schema.Array(SliceSchema),
  reachedOldest: Schema.Boolean,
});

export type NewToOldState = typeof NewToOldStateSchema.Type;
