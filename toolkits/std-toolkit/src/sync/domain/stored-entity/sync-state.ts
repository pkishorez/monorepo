import { Schema } from 'effect';
import { EntityESchema, ESchema } from '../../../schema/eschema/index.js';
import type { OpaqueValue } from './table.js';

export const storedSyncStateSchema = EntityESchema.make(
  'SyncStoredState',
  'key',
  {
    collection: Schema.String,
    strategy: Schema.String,
    value: ESchema.fromType<OpaqueValue>(),
  },
).build();

export type StoredSyncStateValue = typeof storedSyncStateSchema.Type;
