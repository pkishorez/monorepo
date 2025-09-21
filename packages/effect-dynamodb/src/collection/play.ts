import type { ExtractESchemaSchema } from '@monorepo/eschema';
import { ESchema } from '@monorepo/eschema';
import { Schema } from 'effect';
import { DynamoCollection } from './collection.js';

const eschema = ESchema.make(
  'v1',
  Schema.Struct({
    name: Schema.String,
  }),
).build();

const t = DynamoCollection.make(eschema).build();
