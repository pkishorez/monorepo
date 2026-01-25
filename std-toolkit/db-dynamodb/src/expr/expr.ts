import {
  compileConditionExpr,
  type ConditionOperation,
} from "./condition.js";
import { compileUpdateExpr, type UpdateOperation } from "./update.js";
import type { KeyconditionOperation } from "./key-condition.js";
import { AttributeMapBuilder } from "./utils.js";
import type { MarshalledOutput } from "../types/index.js";
import type { DynamoAttrResult } from "./types.js";

// Result types with precise return shapes
type MaybeAttrMaps = {
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: MarshalledOutput;
};

export type QueryExprResult = {
  KeyConditionExpression: string;
  FilterExpression?: string;
} & MaybeAttrMaps;

export type UpdateExprResult = {
  UpdateExpression: string;
  ConditionExpression?: string;
} & MaybeAttrMaps;

export type ConditionExprResult = {
  ConditionExpression: string;
} & MaybeAttrMaps;

// Input types with never guards to ensure only valid combinations
export type QueryExprInput = {
  keyCondition: KeyconditionOperation;
  filter?: ConditionOperation | undefined;
  update?: never;
  condition?: never;
};

export type UpdateExprInput = {
  update: UpdateOperation;
  condition?: ConditionOperation | undefined;
  keyCondition?: never;
  filter?: never;
};

export type ConditionExprInput = {
  condition: ConditionOperation;
  update?: never;
  keyCondition?: never;
  filter?: never;
};

// Function overloads for precise return types
export function buildExpr(input: QueryExprInput): QueryExprResult;
export function buildExpr(input: UpdateExprInput): UpdateExprResult;
export function buildExpr(input: ConditionExprInput): ConditionExprResult;
export function buildExpr(
  input: QueryExprInput | UpdateExprInput | ConditionExprInput,
): QueryExprResult | UpdateExprResult | ConditionExprResult {
  const { update, keyCondition, ...options } = input as {
    update?: UpdateOperation;
    keyCondition?: KeyconditionOperation;
    filter?: ConditionOperation;
    condition?: ConditionOperation;
  };

  // Compile operations
  const compiledUpdate = update ? compileUpdateExpr(update) : undefined;
  const compiledCondition =
    "condition" in options && options.condition
      ? compileConditionExpr(options.condition)
      : undefined;
  const compiledFilter =
    "filter" in options && options.filter
      ? compileConditionExpr(options.filter)
      : undefined;

  const result: {
    UpdateExpression?: string;
    ConditionExpression?: string;
    FilterExpression?: string;
    KeyConditionExpression?: string;
  } & Partial<DynamoAttrResult> = {};

  if (compiledUpdate) {
    result.UpdateExpression = compiledUpdate.exprResult.expr;
  }
  if (compiledCondition) {
    result.ConditionExpression = compiledCondition.expr.expr;
  }
  if (compiledFilter) {
    result.FilterExpression = compiledFilter.expr.expr;
  }
  if (keyCondition) {
    result.KeyConditionExpression = keyCondition.exprResult.expr;
  }

  const attrs = AttributeMapBuilder.mergeAttrResults(
    [
      compiledUpdate?.exprResult.attrResult,
      compiledCondition?.expr.attrResult,
      compiledFilter?.expr.attrResult,
      keyCondition?.exprResult.attrResult,
    ].filter(Boolean) as DynamoAttrResult[],
  );

  if (Object.keys(attrs.ExpressionAttributeNames).length > 0) {
    result.ExpressionAttributeNames = attrs.ExpressionAttributeNames;
  }
  if (Object.keys(attrs.ExpressionAttributeValues).length > 0) {
    result.ExpressionAttributeValues = attrs.ExpressionAttributeValues;
  }

  return result as QueryExprResult | UpdateExprResult | ConditionExprResult;
}
