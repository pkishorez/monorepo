import { DynamoDB, type DynamoDBNativeError } from 'std-toolkit/db/dynamodb';
import { bankTable } from '../../std-table/table/index.ts';

const env = (key: string, fallback: string): string =>
  globalThis.process?.env?.[key] ?? fallback;

// AWS_ACCESS_KEY_ID only holds a real value in deployed/CI contexts —
// local dev never sets it, leaving the 'local' sentinel. Use that to
// decide whether the local DynamoDB instance or real AWS is the target.
const hasRealCredentials = env('AWS_ACCESS_KEY_ID', 'local') !== 'local';

export const dynamoTable = env('BANK_DYNAMODB_TABLE', 'std-bank-v3');
export const dynamoRegion = env(
  'BANK_DYNAMODB_REGION',
  hasRealCredentials ? env('AWS_REGION', 'us-east-1') : 'local',
);
export const dynamoEndpoint = hasRealCredentials
  ? env('BANK_DYNAMODB_ENDPOINT', '')
  : env('BANK_DYNAMODB_ENDPOINT', 'http://localhost:8090');

export const dynamo = DynamoDB.make(bankTable, {
  tableName: dynamoTable,
  region: dynamoRegion,
  credentials: {
    accessKeyId: env('AWS_ACCESS_KEY_ID', 'local'),
    secretAccessKey: env('AWS_SECRET_ACCESS_KEY', 'local'),
  },
  ...(dynamoEndpoint !== '' ? { endpoint: dynamoEndpoint } : {}),
});

export const tableExists = (error: DynamoDBNativeError) => {
  try {
    return JSON.stringify(error.cause).includes('ResourceInUseException');
  } catch {
    return false;
  }
};
