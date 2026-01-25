import type { MarshalledOutput } from "./aws.js";

export type TransactItem =
  | { kind: "put"; options: PutOptions }
  | { kind: "update"; options: UpdateOptions };

export interface PutOptions {
  TableName: string;
  Item: MarshalledOutput;
  ConditionExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: MarshalledOutput;
  ReturnValuesOnConditionCheckFailure?: "ALL_OLD" | "NONE";
}

export interface UpdateOptions {
  TableName: string;
  Key: MarshalledOutput;
  UpdateExpression: string;
  ConditionExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: MarshalledOutput;
  ReturnValuesOnConditionCheckFailure?: "ALL_OLD" | "NONE";
}
