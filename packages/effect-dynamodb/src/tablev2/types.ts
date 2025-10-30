import {
  GetItemInput,
  PutItemInput,
  QueryInput,
  ScanInput,
  UpdateItemInput,
} from 'dynamodb-client';
import { Except } from 'type-fest';

export type IndexDefinition = {
  pk: string;
  sk: string;
};

// GetItemInput
export interface TGetItemInput
  extends Except<
    GetItemInput,
    | 'TableName'
    | 'Key'

    // Deprecated
    | 'AttributesToGet'
  > {}
export interface TPutItemInput
  extends Except<
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
  ReturnValues: 'ALL_OLD';
}
export interface TUpdateItemInput
  extends Except<
    UpdateItemInput,
    | 'TableName'
    | 'Key'
    | 'UpdateExpression'

    // Deprecated
    | 'AttributeUpdates'
    | 'ConditionalOperator'
    | 'Expected'
  > {}
export interface TQueryInput
  extends Except<
    QueryInput,
    | 'TableName'

    // Deprecated
    | 'Select'
    | 'KeyConditions'
    | 'KeyConditionExpression'
    | 'QueryFilter'
    | 'AttributesToGet'
    | 'ConditionalOperator'
  > {
  debug?: boolean;
}
export interface TScanInput
  extends Except<
    ScanInput,
    | 'TableName'

    // Deprecated
    | 'Select'
    | 'ScanFilter'
    | 'AttributesToGet'
    | 'ConditionalOperator'
  > {}
