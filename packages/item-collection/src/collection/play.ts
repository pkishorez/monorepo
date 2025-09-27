import { ESchema } from '@monorepo/eschema';
import { Schema } from 'effect';
import { ItemCollection } from './collection.js';

const eschema = ESchema.make(
  'v1',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
  }),
).build();

const t = ItemCollection.make('test').eschema(eschema).key('id').build();
