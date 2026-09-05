import * as DynamoDB from 'alchemy/AWS/DynamoDB';
import type { DynamoTableTopology } from '../index.js';

interface DynamoDBTableOptions {
  readonly resourceId: string;
  readonly tableName: string;
}

export const makeDynamoDBTable = (
  topology: DynamoTableTopology,
  options: DynamoDBTableOptions,
) => {
  const attributes = Object.fromEntries(
    topology.AttributeDefinitions.map((attribute) => [
      attribute.AttributeName,
      attribute.AttributeType,
    ]),
  );
  const partitionKey = topology.KeySchema.find(
    (key) => key.KeyType === 'HASH',
  )!.AttributeName;
  const sortKey = topology.KeySchema.find(
    (key) => key.KeyType === 'RANGE',
  )?.AttributeName;

  return DynamoDB.Table(options.resourceId, {
    tableName: options.tableName,
    partitionKey,
    attributes,
    billingMode: topology.BillingMode,
    ...(sortKey !== undefined ? { sortKey } : {}),
    ...(topology.LocalSecondaryIndexes !== undefined
      ? {
          localSecondaryIndexes: topology.LocalSecondaryIndexes.map(
            (index) => ({
              indexName: index.IndexName,
              sortKey: index.KeySchema.find((key) => key.KeyType === 'RANGE')!
                .AttributeName,
              projection: index.Projection,
            }),
          ),
        }
      : {}),
    ...(topology.GlobalSecondaryIndexes !== undefined
      ? {
          globalSecondaryIndexes: topology.GlobalSecondaryIndexes.map(
            (index) => {
              const sortKey = index.KeySchema.find(
                (key) => key.KeyType === 'RANGE',
              )?.AttributeName;
              return {
                indexName: index.IndexName,
                partitionKey: index.KeySchema.find(
                  (key) => key.KeyType === 'HASH',
                )!.AttributeName,
                ...(sortKey !== undefined ? { sortKey } : {}),
                projection: index.Projection,
                ...(index.ProvisionedThroughput !== undefined
                  ? { provisionedThroughput: index.ProvisionedThroughput }
                  : {}),
                ...(index.OnDemandThroughput !== undefined
                  ? { onDemandThroughput: index.OnDemandThroughput }
                  : {}),
                ...(index.WarmThroughput !== undefined
                  ? { warmThroughput: index.WarmThroughput }
                  : {}),
              };
            },
          ),
        }
      : {}),
  });
};
