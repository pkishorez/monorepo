import {
  GetItemInput,
  Put,
  PutItemInput,
  QueryInput,
  ScanInput,
  Update,
  UpdateItemInput,
} from '@std-toolkit/dynamodb-client';
import { Except } from 'type-fest';

export type IndexDefinition = {
  pk: string;
  sk: string;
};

// GetItemInput
export interface TGetItemInput extends Except<
  GetItemInput,
  | 'TableName'
  | 'Key'

  // Deprecated
  | 'AttributesToGet'
> {}

export interface TPut extends Except<Put, 'TableName'> {}
export interface TPutItemInput extends Except<
  PutItemInput,
  | 'TableName'
  | 'Item'

  // Cleanup
  | 'ReturnValues'

  // Deprecated
  | 'Expected'
  | 'ConditionalOperator'
> {
  // For put only ALL_OLD is valid
  ReturnValues?: 'ALL_OLD';
}

export interface TUpdate extends Except<
  Update,
  'TableName' | 'Key' | 'ExpressionAttributeNames' | 'ExpressionAttributeValues'
> {}
export interface TUpdateItemInput extends Except<
  UpdateItemInput,
  | 'TableName'
  | 'Key'

  // Deprecated
  | 'AttributeUpdates'
  | 'ConditionalOperator'
  | 'Expected'
> {}
export interface TQueryInput extends Except<
  QueryInput,
  | 'TableName'
  | 'KeyConditionExpression'
  | 'FilterExpression'
  | 'ExpressionAttributeNames'
  | 'ExpressionAttributeValues'

  // Deprecated
  | 'Select'
  | 'KeyConditions'
  | 'QueryFilter'
  | 'AttributesToGet'
  | 'ConditionalOperator'
> {
  debug?: boolean;
}
export interface TScanInput extends Except<
  ScanInput,
  | 'TableName'

  // Deprecated
  | 'Select'
  | 'ScanFilter'
  | 'AttributesToGet'
  | 'ConditionalOperator'
> {}
