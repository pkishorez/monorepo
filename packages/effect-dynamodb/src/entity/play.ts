import { ESchema } from '@monorepo/eschema';
import { Schema } from 'effect';
import { DynamoTable } from '../table/index.js';
import { DynamoEntity } from './entity.js';

const table = DynamoTable.make('playground', {
  endpoint: 'http://localhost:8090',
  accessKey: 'access',
  secretKey: 'access',
})
  .primary('pkey', 'skey')
  .gsi('GSI1', 'gsi1pk', 'gsi1sk')
  .build();

const eschema = ESchema.make(
  'v1',
  Schema.Struct({
    userId: Schema.String,
    name: Schema.String,
    age: Schema.Number,
    email: Schema.String,
    createdAt: Schema.Number,
    status: Schema.String,
    metadata: Schema.Struct({
      nested: Schema.String,
    }),
  }),
).build();

// Create entity using the fluent builder API with full type safety
export const userEntity = DynamoEntity.make(eschema, table)
  .pk({
    schema: ['userId'],
    derive: ({ userId }) => userId,
  })
  .sk({
    schema: ['age'],
    derive: ({ age }) => `${age}`,
  })
  .index('GSI1')
  .pk({
    schema: ['age'],
    derive: ({ age }) => `${age}`,
  })
  .sk({
    schema: ['age'],
    derive: ({ age }) => `${age}`,
  })
  .build();
