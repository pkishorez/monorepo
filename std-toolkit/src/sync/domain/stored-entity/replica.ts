import { Schema } from 'effect';
import { EntityESchema, fromType } from '../../../eschema/index.js';
import { syncStore, type OpaqueValue } from './table.js';

const storedReplicaSchema = EntityESchema.make('SyncStoredReplica', 'key', {
  collection: Schema.String,
  seq: Schema.String,
  entity: fromType<OpaqueValue>(),
}).build();

export const storedReplicaEntity = syncStore
  .entity(storedReplicaSchema)
  .primary({ pk: ['collection'] })
  .index('LSI1', 'bySequence', { sk: ['seq'] })
  .build();

export type StoredReplicaValue = typeof storedReplicaSchema.Type;
