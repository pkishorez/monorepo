import { Schema } from 'effect';

export class NoItemToUpdate extends Schema.TaggedError<NoItemToUpdate>(
  'NoItemToUpdate',
)('NoItemToUpdate', {}) {}

export class ItemAlreadyExist extends Schema.TaggedError<ItemAlreadyExist>(
  'ItemAlreadyExist',
)('ItemAlreadyExist', {}) {}
