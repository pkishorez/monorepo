import * as DynamoDB from 'alchemy/AWS/DynamoDB';
import type { DynamoTableTopology } from 'std-toolkit/db/dynamodb';

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
    ...(topology.GlobalSecondaryIndexes !== undefined
      ? { globalSecondaryIndexes: topology.GlobalSecondaryIndexes }
      : {}),
  });
};
