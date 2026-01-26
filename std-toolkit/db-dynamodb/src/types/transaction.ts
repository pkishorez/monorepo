import type { MarshalledOutput } from "./aws.js";

// Base type for table-level operations (no entity name)
export type TransactItemBase =
  | { kind: "put"; options: PutOptions }
  | { kind: "update"; options: UpdateOptions };

// Full type for entity-level operations (with entity name for type-safe transactions)
export type TransactItem<TEntityName extends string = string> =
  | { kind: "put"; entityName: TEntityName; options: PutOptions }
  | { kind: "update"; entityName: TEntityName; options: UpdateOptions };

export interface PutOptions {
  TableName: string;
  Item: MarshalledOutput;
  ConditionExpression?: string | undefined;
  ExpressionAttributeNames?: Record<string, string> | undefined;
  ExpressionAttributeValues?: MarshalledOutput | undefined;
  ReturnValuesOnConditionCheckFailure?: "ALL_OLD" | "NONE" | undefined;
}

export interface UpdateOptions {
  TableName: string;
  Key: MarshalledOutput;
  UpdateExpression: string;
  ConditionExpression?: string | undefined;
  ExpressionAttributeNames?: Record<string, string> | undefined;
  ExpressionAttributeValues?: MarshalledOutput | undefined;
  ReturnValuesOnConditionCheckFailure?: "ALL_OLD" | "NONE" | undefined;
}
