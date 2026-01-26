import { compileConditionExpr, type ConditionOperation } from "./condition.js";
import { compileUpdateExpr, type UpdateOperation } from "./update.js";
import type { KeyconditionOperation } from "./key-condition.js";
import { AttributeMapBuilder } from "./utils.js";
import type { MarshalledOutput } from "../types/index.js";
import type { DynamoAttrResult } from "./types.js";

/**
 * Optional attribute maps that may be included in expression results.
 */
type MaybeAttrMaps = {
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: MarshalledOutput;
};

/**
 * Result of building a query expression with key condition and optional filter.
 */
export type QueryExprResult = {
  /** The key condition expression string */
  KeyConditionExpression: string;
  /** Optional filter expression string */
  FilterExpression?: string;
} & MaybeAttrMaps;

/**
 * Result of building an update expression with optional condition.
 */
export type UpdateExprResult = {
  /** The update expression string */
  UpdateExpression: string;
  /** Optional condition expression string */
  ConditionExpression?: string;
} & MaybeAttrMaps;

/**
 * Result of building a standalone condition expression.
 */
export type ConditionExprResult = {
  /** The condition expression string */
  ConditionExpression: string;
} & MaybeAttrMaps;

/**
 * Input for building a query expression.
 */
export type QueryExprInput = {
  /** The key condition operation for the query */
  keyCondition: KeyconditionOperation;
  /** Optional filter to apply after the query */
  filter?: ConditionOperation | undefined;
  /** Never allowed in query input */
  update?: never;
  /** Never allowed in query input */
  condition?: never;
};

/**
 * Input for building an update expression.
 */
export type UpdateExprInput = {
  /** The update operations to perform */
  update: UpdateOperation;
  /** Optional condition for conditional update */
  condition?: ConditionOperation | undefined;
  /** Never allowed in update input */
  keyCondition?: never;
  /** Never allowed in update input */
  filter?: never;
};

/**
 * Input for building a standalone condition expression.
 */
export type ConditionExprInput = {
  /** The condition operation */
  condition: ConditionOperation;
  /** Never allowed in condition-only input */
  update?: never;
  /** Never allowed in condition-only input */
  keyCondition?: never;
  /** Never allowed in condition-only input */
  filter?: never;
};

/**
 * Builds a DynamoDB query expression with key condition and optional filter.
 *
 * @param input - Query expression input with keyCondition and optional filter
 * @returns Compiled query expression result
 */
export function buildExpr(input: QueryExprInput): QueryExprResult;

/**
 * Builds a DynamoDB update expression with optional condition.
 *
 * @param input - Update expression input with update operations and optional condition
 * @returns Compiled update expression result
 */
export function buildExpr(input: UpdateExprInput): UpdateExprResult;

/**
 * Builds a standalone DynamoDB condition expression.
 *
 * @param input - Condition expression input
 * @returns Compiled condition expression result
 */
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
