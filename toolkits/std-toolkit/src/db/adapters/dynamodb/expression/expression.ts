import {
  compileConditionExpr,
  exprCondition as makeCondition,
  exprFilter as makeFilter,
  type ConditionOperation,
  type ConditionOps,
} from './condition.js';
import {
  keyConditionExpr as makeKeyCondition,
  type KeyconditionOperation,
  type KeyConditionExprParameters,
  type SortKeyparameter,
} from './key-condition.js';
import { AttributeMapBuilder } from './attribute-map.js';
import type { DynamoAttrResult } from './types.js';
import type { MarshalledOutput } from '../attribute-value/index.js';
import type { IndexDefinition } from './types.js';

/**
 * Optional attribute maps that may be included in expression results.
 */
type MaybeAttrMaps = {
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: MarshalledOutput;
};

export function exprCondition<T>(
  builder: (operations: ConditionOps<T>) => ConditionOperation<T>,
): ConditionOperation<T> {
  return makeCondition(builder);
}

export function exprFilter<T>(
  builder: (operations: ConditionOps<T>) => ConditionOperation<T>,
): ConditionOperation<T> {
  return makeFilter(builder);
}

export function keyConditionExpr(
  index: IndexDefinition,
  parameters: KeyConditionExprParameters,
): KeyconditionOperation {
  return makeKeyCondition(index, parameters);
}

export type {
  ConditionOperation,
  KeyConditionExprParameters,
  SortKeyparameter,
};
export type { IndexDefinition } from './types.js';

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
 * Result of building a standalone condition expression.
 */
export type ConditionExprResult = {
  /** The condition expression string */
  ConditionExpression: string;
} & MaybeAttrMaps;

/**
 * Result of building a standalone filter expression.
 */
export type FilterExprResult = {
  /** The filter expression string */
  FilterExpression: string;
} & MaybeAttrMaps;

/**
 * Input for building a query expression.
 */
export type QueryExprInput<T = unknown> = {
  /** The key condition operation for the query */
  keyCondition: KeyconditionOperation;
  /** Optional filter to apply after the query */
  filter?: ConditionOperation<T> | undefined;
  /** Never allowed in query input */
  condition?: never;
};

/**
 * Input for building a standalone condition expression.
 */
export type ConditionExprInput<T = unknown> = {
  /** The condition operation */
  condition: ConditionOperation<T>;
  /** Never allowed in condition-only input */
  keyCondition?: never;
  /** Never allowed in condition-only input */
  filter?: never;
};

/**
 * Input for building a standalone filter expression.
 */
export type FilterExprInput<T = unknown> = {
  /** The filter operation */
  filter: ConditionOperation<T>;
  /** Never allowed in filter-only input */
  keyCondition?: never;
  /** Never allowed in filter-only input */
  condition?: never;
};

/**
 * Builds a DynamoDB query expression with key condition and optional filter.
 *
 * @param input - Query expression input with keyCondition and optional filter
 * @returns Compiled query expression result
 */
export function buildExpr<T>(input: QueryExprInput<T>): QueryExprResult;

/**
 * Builds a standalone DynamoDB condition expression.
 *
 * @param input - Condition expression input
 * @returns Compiled condition expression result
 */
export function buildExpr<T>(input: ConditionExprInput<T>): ConditionExprResult;

/**
 * Builds a standalone DynamoDB filter expression.
 *
 * @param input - Filter expression input
 * @returns Compiled filter expression result
 */
export function buildExpr<T>(input: FilterExprInput<T>): FilterExprResult;

export function buildExpr<T>(
  input: QueryExprInput<T> | ConditionExprInput<T> | FilterExprInput<T>,
): QueryExprResult | ConditionExprResult | FilterExprResult {
  const { keyCondition, ...options } = input as {
    keyCondition?: KeyconditionOperation;
    filter?: ConditionOperation<T>;
    condition?: ConditionOperation<T>;
  };

  const compiledCondition =
    'condition' in options && options.condition
      ? compileConditionExpr(options.condition)
      : undefined;
  const compiledFilter =
    'filter' in options && options.filter
      ? compileConditionExpr(options.filter)
      : undefined;

  const result: {
    ConditionExpression?: string;
    FilterExpression?: string;
    KeyConditionExpression?: string;
  } & Partial<DynamoAttrResult> = {};

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

  return result as QueryExprResult | ConditionExprResult | FilterExprResult;
}
