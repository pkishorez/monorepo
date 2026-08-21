import { DynamoDB, type DynamoDBNativeError } from 'std-toolkit/db/dynamodb';
import { bankTable } from '../../std-table/table/index.ts';

const env = (key: string, fallback: string): string =>
  globalThis.process?.env?.[key] ?? fallback;

const endpoint = env('BANK_DYNAMODB_ENDPOINT', 'http://localhost:8090');
const isLocal = endpoint !== '';

export const dynamo = DynamoDB.make(bankTable, {
  tableName: env('BANK_DYNAMODB_TABLE', 'std-bank-v3'),
  region: env('BANK_DYNAMODB_REGION', 'local'),
  credentials: {
    accessKeyId: env('AWS_ACCESS_KEY_ID', 'local'),
    secretAccessKey: env('AWS_SECRET_ACCESS_KEY', 'local'),
  },
  ...(isLocal ? { endpoint } : {}),
});

export const tableExists = (error: DynamoDBNativeError) => {
  try {
    return JSON.stringify(error.cause).includes('ResourceInUseException');
  } catch {
    return false;
  }
};
