import { Schema } from 'effect';
import { EntityESchema } from '../../../eschema/index.js';
import { syncStore } from './table.js';

const storedReplicaCursorSchema = EntityESchema.make(
  'SyncStoredReplicaCursor',
  'key',
  {
    collection: Schema.String,
    position: Schema.String,
  },
).build();

export const storedReplicaCursorEntity = syncStore
  .entity(storedReplicaCursorSchema)
  .primary({ pk: ['collection'] })
  .build();
