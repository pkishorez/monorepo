import { Schema } from 'effect';

export class NoItemToUpdate extends Schema.TaggedError<NoItemToUpdate>(
  'NoItemToUpdate',
)('NoItemToUpdate', {}) {}
