import { Schema } from 'effect';

export class StdToolkitError extends Schema.TaggedError<StdToolkitError>()(
  'StdToolkitError',
  {
    message: Schema.String,
    code: Schema.optional(Schema.String),
  },
) {}
