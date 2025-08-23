import { ESchema } from '@monorepo/eschema';
import { Schema } from 'effect';
import { DynamoEntity } from './entity/entity.js';
import { DynamoTable } from './table/table.js';

const table = DynamoTable.make('table', {
  accessKey: 'accessKey',
  secretKey: 'secretKey',
})
  .primary('pkey', 'skey')
  .lsi('LSI1', 'lsi1skey')
  .gsi('GSI1', 'gsi1pk', 'gsi1sk')
  .gsi('GSI2', 'gsi2pk', 'gsi2sk')
  .build();

const eschema = ESchema.make(
  'v1',
  Schema.Struct({
    name: Schema.String,
    age: Schema.Number,
    company: Schema.String,
    brand: Schema.String,
  }),
).build();

export const entity = DynamoEntity
  // BR
  .make(table, eschema)
  .primary({
    schema: eschema.schema.pick('name'), // BR
    fn: ({ name }) => ({ pkey: name, skey: 'hey' }),
  })
  .index('LSI1', {
    schema: eschema.schema.pick('name'),
    fn: ({ name }) => ({ pkey: name, lsi1skey: name }),
  })
  .build();
