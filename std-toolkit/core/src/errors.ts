import { Schema } from 'effect';

export class NoItemToUpdate extends Schema.TaggedError<NoItemToUpdate>(
  'NoItemToUpdate',
)('NoItemToUpdate', {}) {}

export class ItemAlreadyExist extends Schema.TaggedError<ItemAlreadyExist>(
  'ItemAlreadyExist',
)('ItemAlreadyExist', {
  message: Schema.optional(Schema.String),
}) {}
export class ItemNotFound extends Schema.TaggedError<ItemNotFound>(
  'ItemNotFound',
)('ItemNotFound', {
  message: Schema.optional(Schema.String),
}) {}
export class DatabaseError extends Schema.TaggedError<DatabaseError>(
  'DatabaseError',
)('DatabaseError', {
  message: Schema.optional(Schema.String),
}) {}
