import { Schema } from 'effect';
import { EntityESchema } from '../../../eschema/index.js';
import { syncStore } from './table.js';

const storedVersionSchema = EntityESchema.make('SyncStoredVersion', 'key', {
  collection: Schema.String,
  version: Schema.String,
}).build();

export const storedVersionEntity = syncStore
  .entity(storedVersionSchema)
  .primary({ pk: ['collection'] })
  .build();
