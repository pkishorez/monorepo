import { Schema } from 'effect';

export const metaSchema = Schema.Struct({
  __v: Schema.String,
  __i: Schema.Number,
  __d: Schema.Boolean,
});
