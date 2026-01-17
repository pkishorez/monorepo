import { Schema } from 'effect';

export const metaSchema = Schema.Struct({
  _e: Schema.String,
  _v: Schema.String,
  _i: Schema.Number,
  _d: Schema.Boolean,
});
