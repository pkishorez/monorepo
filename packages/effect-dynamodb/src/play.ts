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
  .build();

const eschema = ESchema.make(
  'v1',
  Schema.Struct({
    userName: Schema.String,
    firstName: Schema.String,
    lastName: Schema.String,
    age: Schema.Number,
    company: Schema.String,
    brand: Schema.String,
  }),
)
  .evolve(
    'v2',
    ({ v1 }) => Schema.Struct({ ...v1.fields, fullName: Schema.String }),
    (value, v) => {
      return v({ ...value, fullName: `${value.firstName} ${value.lastName}` });
    },
  )
  .build();

export const entity = DynamoEntity
  // BR
  .make(table, eschema)
  .primary({
    pk: {
      schema: eschema.schema.pick('userName'), // BR
      fn: ({ userName }) => `USERNAME#${userName}`,
    },
    sk: {
      schema: eschema.schema.pick('userName'), // BR
      fn: ({ userName }) => `USERNAME#${userName}`,
    },
  })
  .index('LSI1', {
    pk: {
      schema: eschema.schema.pick('userName'), // BR
      fn: ({ userName }) => `USERNAME#${userName}`,
    },
    sk: {
      schema: eschema.schema.pick('userName'), // BR
      fn: ({ userName }) => `USERNAME#${userName}`,
    },
  })
  .build();

entity
  .index('LSI1')
  .query({ pk: { userName: '12' }, sk: { beginsWith: 'test' } });

entity.getItem({ userName: 'kishore' });
entity.putItem({
  age: 10,
  brand: 'Numa',
  company: 'OYO',
  firstName: 'Kishore',
  lastName: 'Kishore',
  fullName: 'Kishore Kishore',
  userName: 'kishore',
});
