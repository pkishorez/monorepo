import { Schema } from 'effect';

export class ItemNotFoundError extends Schema.TaggedError<ItemNotFoundError>(
  'ItemNotFoundError',
)('ItemNotFoundError', {}) {}
