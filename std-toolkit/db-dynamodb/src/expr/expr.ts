import type { CompiledConditionOperation } from "./condition.js";
import type { CompiledUpdateOperation } from "./update.js";
import type { KeyconditionOperation } from "./key-condition.js";
import { AttributeMapBuilder } from "./utils.js";
import type { MarshalledOutput } from "../types/index.js";
import type { DynamoAttrResult } from "./types.js";

export const buildExpr = ({
  update,
  keyCondition,
  ...options
}: {
  update?: CompiledUpdateOperation | undefined;
  keyCondition?: KeyconditionOperation | undefined;
} & (
  | { filter?: CompiledConditionOperation | undefined }
  | { condition?: CompiledConditionOperation | undefined }
)): {
  UpdateExpression?: string;
  ConditionExpression?: string;
  FilterExpression?: string;
  KeyConditionExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: MarshalledOutput;
} => {
  const result: {
    UpdateExpression?: string;
    ConditionExpression?: string;
    FilterExpression?: string;
    KeyConditionExpression?: string;
  } & Partial<DynamoAttrResult> = {};

  if (update) {
    result.UpdateExpression = update.exprResult.expr;
  }
  if ("condition" in options && options.condition) {
    result.ConditionExpression = options.condition.expr.expr;
  }
  if ("filter" in options && options.filter) {
    result.FilterExpression = options.filter.expr.expr;
  }
  if (keyCondition) {
    result.KeyConditionExpression = keyCondition.exprResult.expr;
  }

  const attrs = AttributeMapBuilder.mergeAttrResults(
    [
      update?.exprResult.attrResult,
      "condition" in options && options?.condition?.expr.attrResult,
      "filter" in options && options?.filter?.expr.attrResult,
      keyCondition?.exprResult.attrResult,
    ].filter(Boolean) as DynamoAttrResult[],
  );

  if (Object.keys(attrs.ExpressionAttributeNames).length > 0) {
    result.ExpressionAttributeNames = attrs.ExpressionAttributeNames;
  }
  if (Object.keys(attrs.ExpressionAttributeValues).length > 0) {
    result.ExpressionAttributeValues = attrs.ExpressionAttributeValues;
  }

  return result;
};
