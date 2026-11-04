import { Schema } from 'effect';
import { EntityESchema } from '../../../schema/eschema/index.js';

export const storedReplicaCursorSchema = EntityESchema.make(
  'SyncStoredReplicaCursor',
  'key',
  {
    collection: Schema.String,
    position: Schema.String,
  },
).build();
