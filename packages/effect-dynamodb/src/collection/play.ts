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

type TEST_EXTRACT_SCHEMA = ExtractESchemaSchema<typeof extended>;

const extended = eschema.extend(Schema.Struct({ __m: Schema.String }));

const t = DynamoCollection.make(eschema);
const t2 = t.upsertSchema;
const t23 = t.querySchema;
