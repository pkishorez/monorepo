import { Schema } from 'effect';
import { EntityESchema, ESchema } from '../../../eschema/index.js';
import { syncStore, type OpaqueValue } from './table.js';

const storedSyncStateSchema = EntityESchema.make('SyncStoredState', 'key', {
  collection: Schema.String,
  strategy: Schema.String,
  value: ESchema.fromType<OpaqueValue>(),
}).build();

export const storedSyncStateEntity = syncStore
  .entity(storedSyncStateSchema)
  .primary({ pk: ['collection'] })
  .build();

export type StoredSyncStateValue = typeof storedSyncStateSchema.Type;
