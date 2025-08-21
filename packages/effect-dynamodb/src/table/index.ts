export { DynamoTable } from './table.js';
export type {
  BatchGetResult,
  BatchWriteRequest,
  BatchWriteResult,
  EnhancedDeleteResult,
  EnhancedGetItemResult,
  EnhancedPutResult,
  EnhancedQueryResult,
  EnhancedScanResult,
  EnhancedUpdateResult,
  KeyFromIndex,
  TransactGetItem,
  TransactGetResult,
  TransactWriteItem,
  TransactWriteResult,
} from './types.js';
// All DynamoDB types are now available directly from dynamodb-client
export type {
  BatchGetItemInput,
  BatchWriteItemInput,
  ConsumedCapacity,
  DeleteItemInput,
  GetItemInput,
  ItemCollectionMetrics,
  PutItemInput,
  QueryInput,
  ScanInput,
  TransactGetItemsInput,
  TransactWriteItemsInput,
  UpdateItemInput,
} from 'dynamodb-client';
