import type { MarshalledOutput } from "./aws.js";

export type TransactItem =
  | { kind: "put"; options: PutOptions }
  | { kind: "update"; options: UpdateOptions };

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
