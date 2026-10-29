import { Schema } from 'effect';
import { EntityESchema, ESchema } from '../../../eschema/index.js';
import type { OpaqueValue } from './table.js';

export const storedReplicaSchema = EntityESchema.make(
  'SyncStoredReplica',
  'key',
  {
    collection: Schema.String,
    seq: Schema.String,
    entity: ESchema.fromType<OpaqueValue>(),
  },
).build();

export type StoredReplicaValue = typeof storedReplicaSchema.Type;
