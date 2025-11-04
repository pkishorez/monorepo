import { DynamoTable, DynamoEntity } from '@std-toolkit/dynamodb';
import { TodoESchema } from './domain';

const table = DynamoTable.make({
  endpoint: 'http://localhost:8090',
  tableName: 'playground',
  credentials: {
    accessKeyId: 'access',
    secretAccessKey: 'access',
  },
})
  .primary('pkey', 'skey')
  .gsi('GSI1', 'gsi1pk', 'gsi1sk')
  .gsi('GSI2', 'gsi2pk', 'gsi2sk')
  .lsi('LSI1', 'lsi1skey')
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
