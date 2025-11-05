import { DynamoTable, DynamoEntity } from '@std-toolkit/dynamodb';
import { env } from 'cloudflare:workers';
import { TodoESchema } from './domain';

const table = DynamoTable.make({
  region: env.DYNAMO_REGION ? env.DYNAMO_REGION : undefined,
  endpoint: env.DYNAMO_ENDPOINT ? env.DYNAMO_ENDPOINT : undefined,
  tableName: env.DYNAMO_TABLE_NAME,
  credentials: {
    accessKeyId: env.DYNAMO_ACCESS_KEY,
    secretAccessKey: env.DYNAMO_SECRET_KEY,
  },
})
  .primary('pkey', 'skey')
  .gsi('GSI1', 'gsi1pk', 'gsi1sk')
  .gsi('GSI2', 'gsi2pk', 'gsi2sk')
  .gsi('GSI3', 'gsi3pk', 'gsi3sk')
  .gsi('GSI4', 'gsi4pk', 'gsi4sk')
  .build();

export const todoEntity = DynamoEntity.make(table)
  .eschema(TodoESchema)
  .primary({
    pk: {
      deps: ['userId'],
      derive: ({ userId }) => [userId, 'TODOS'],
    },
    sk: {
      deps: ['todoId'],
      derive: ({ todoId }) => [todoId],
    },
  })
  .index('GSI1', 'byUpdated', {
    pk: {
      deps: ['userId'],
      derive: ({ userId }) => [userId, 'TODOS'],
    },
    sk: {
      deps: ['updatedAt'],
      derive: ({ updatedAt }) => [updatedAt],
    },
  })
  .build();
