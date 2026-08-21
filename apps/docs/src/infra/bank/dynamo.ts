import { Effect } from 'effect';
import { DynamoDB, type DynamoDBNativeError } from 'std-toolkit/db/dynamodb';
import { bankTable } from '../../demos/bank/std-table/table/index.ts';
import { dynamoSettings } from './config.ts';

export const dynamoClient = Effect.map(
  dynamoSettings,
  ({ tableName, region, endpoint, accessKeyId, secretAccessKey }) =>
    DynamoDB.make(bankTable, {
      tableName,
      region,
      credentials: { accessKeyId, secretAccessKey },
      ...(endpoint !== '' ? { endpoint } : {}),
    }),
);

export const tableExists = (error: DynamoDBNativeError) => {
  try {
    return JSON.stringify(error.cause).includes('ResourceInUseException');
  } catch {
    return false;
  }
};
