import type { MarshalledOutput } from "./aws.js";

/**
 * Base type for table-level transaction operations without entity name.
 */
export type TransactItemBase =
  | { kind: "put"; options: PutOptions }
  | { kind: "update"; options: UpdateOptions };

/**
 * Full type for entity-level transaction operations with entity name for type-safe transactions.
 *
 * @typeParam TEntityName - String literal type for the entity name
 */
export type TransactItem<TEntityName extends string = string> =
  | { kind: "put"; entityName: TEntityName; options: PutOptions }
  | { kind: "update"; entityName: TEntityName; options: UpdateOptions };

/**
 * Options for a DynamoDB Put operation in a transaction.
 */
export interface PutOptions {
  /** Name of the DynamoDB table */
  TableName: string;
  /** The item to put, in marshalled DynamoDB format */
  Item: MarshalledOutput;
  /** Optional condition expression that must be satisfied for the put to succeed */
  ConditionExpression?: string | undefined;
  /** Substitution tokens for attribute names in the condition expression */
  ExpressionAttributeNames?: Record<string, string> | undefined;
  /** Substitution tokens for attribute values in the condition expression */
  ExpressionAttributeValues?: MarshalledOutput | undefined;
  /** Whether to return the item's attributes if the condition check fails */
  ReturnValuesOnConditionCheckFailure?: "ALL_OLD" | "NONE" | undefined;
}

/**
 * Options for a DynamoDB Update operation in a transaction.
 */
export interface UpdateOptions {
  /** Name of the DynamoDB table */
  TableName: string;
  /** The primary key of the item to update, in marshalled DynamoDB format */
  Key: MarshalledOutput;
  /** The update expression defining the attributes to modify */
  UpdateExpression: string;
  /** Optional condition expression that must be satisfied for the update to succeed */
  ConditionExpression?: string | undefined;
  /** Substitution tokens for attribute names in expressions */
  ExpressionAttributeNames?: Record<string, string> | undefined;
  /** Substitution tokens for attribute values in expressions */
  ExpressionAttributeValues?: MarshalledOutput | undefined;
  /** Whether to return the item's attributes if the condition check fails */
  ReturnValuesOnConditionCheckFailure?: "ALL_OLD" | "NONE" | undefined;
}
