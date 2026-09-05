import { expect, it, vi } from 'vitest';
import type { DynamoTableTopology } from '../../index.js';

const { table } = vi.hoisted(() => ({
  table: vi.fn((id: string, props: unknown) => ({ id, props })),
}));
vi.mock('alchemy/AWS/DynamoDB', () => ({ Table: table }));
import { makeDynamoDBTable } from '../index.js';

it('preserves physical identity, attributes, and both kinds of secondary indexes', () => {
  const topology: DynamoTableTopology = {
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' },
      { AttributeName: 'sk', AttributeType: 'S' },
      { AttributeName: 'alternate', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'pk', KeyType: 'HASH' },
      { AttributeName: 'sk', KeyType: 'RANGE' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    LocalSecondaryIndexes: [
      {
        IndexName: 'byAlternate',
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'alternate', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'byAlternateGlobally',
        KeySchema: [{ AttributeName: 'alternate', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  };
  makeDynamoDBTable(topology, {
    resourceId: 'ExistingResource',
    tableName: 'existing-physical-table',
  });
  expect(table).toHaveBeenCalledWith('ExistingResource', {
    tableName: 'existing-physical-table',
    partitionKey: 'pk',
    sortKey: 'sk',
    attributes: { pk: 'S', sk: 'S', alternate: 'S' },
    billingMode: 'PAY_PER_REQUEST',
    localSecondaryIndexes: [
      {
        indexName: 'byAlternate',
        sortKey: 'alternate',
        projection: { ProjectionType: 'ALL' },
      },
    ],
    globalSecondaryIndexes: [
      {
        indexName: 'byAlternateGlobally',
        partitionKey: 'alternate',
        projection: { ProjectionType: 'ALL' },
      },
    ],
  });
});
