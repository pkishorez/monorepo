import { Match } from 'effect';
import { ExprResult, ValidPaths } from './types.js';
import type { Get, Paths } from 'type-fest';
import { AttributeMapBuilder } from './utils.js';

// ============================================================================
// Core Types
// ============================================================================

/**
 * The final result of a condition expression that can be sent to DynamoDB
 */
export type ConditionOperation<T = any> = {
  type: 'condition_operation';
  expr: ExprResult;
  value?: T;
};

// ============================================================================
// Operation Types - Individual condition operations
// ============================================================================

/**
 * Basic comparison condition - compares an attribute to a value
 */
export type CondOperation<T = any> = {
  type: 'condition_condition';
  expr: string;
  key: ValidPaths<T>;
};

/**
 * AND operation - combines multiple conditions with logical AND
 */
export type AndOperation<T = any> = {
  type: 'condition_and';
  expr: string;
  value?: T;
};

/**
 * OR operation - combines multiple conditions with logical OR
 */
export type OrOperation<T = any> = {
  type: 'condition_or';
  expr: string;
  value?: T;
};

/**
 * Union of all possible condition operations
 */
type AnyCondition<T = any> =
  | CondOperation<T>
  | AndOperation<T>
  | OrOperation<T>;

// ============================================================================
// Operation Builder Interface
// ============================================================================

/**
 * Helper type to get valid keys - falls back to string for any type
 */
type ValidConditionKeys<T> = T extends any
  ? unknown extends T
    ? string
    : Paths<T, { bracketNotation: true }>
  : never;

/**
 * Builder interface that provides helper methods for creating condition operations
 * This is the interface passed to the callback in conditionExpr
 */
type ConditionOps<T> = {
  /** Create a comparison condition between an attribute and a value */
  cond: <Key extends ValidConditionKeys<T>>(
    key: Key,
    op: '=' | '<>' | '<' | '<=' | '>' | '>=',
    value: Get<T, Key>,
  ) => CondOperation;

  /** Combine multiple conditions with AND (supports any condition type) */
  and: (...ops: AnyCondition<T>[]) => AndOperation;

  /** Combine multiple conditions with OR (supports any condition type) */
  or: (...ops: AnyCondition<T>[]) => OrOperation;
};

// ============================================================================
// Helper Functions - Create individual operations
// ============================================================================

/**
 * Creates a comparison condition
 * @internal
 */
function cond<T, Key extends ValidPaths<T> = ValidPaths<T>>(
  attrBuilder: AttributeMapBuilder,
  key: Key,
  op: '=' | '<>' | '<' | '<=' | '>' | '>=',
  value: Get<T, Key>,
): CondOperation {
  return {
    type: 'condition_condition',
    expr: `${attrBuilder.attr(key)} ${op} ${attrBuilder.value(value)}`,
    key: key,
  };
}

/**
 * Creates an AND operation by combining multiple conditions
 * @internal
 */
function and(...ops: AnyCondition[]): AndOperation {
  const expr = ops
    .map((op) =>
      Match.value(op).pipe(
        Match.when({ type: 'condition_and' }, (v) => v.expr),
        Match.when({ type: 'condition_or' }, (v) => v.expr),
        Match.when({ type: 'condition_condition' }, (v) => v.expr),
        Match.exhaustive,
      ),
    )
    .join(' AND ');
  return {
    type: 'condition_and',
    expr: `( ${expr} )`,
  };
}

/**
 * Creates an OR operation by combining multiple conditions
 * @internal
 */
function or(...ops: AnyCondition[]): OrOperation {
  const expr = ops
    .map((op) =>
      Match.value(op).pipe(
        Match.when({ type: 'condition_or' }, (v) => v.expr),
        Match.when({ type: 'condition_and' }, (v) => v.expr),
        Match.when({ type: 'condition_condition' }, (v) => v.expr),
        Match.exhaustive,
      ),
    )
    .join(' OR ');
  return {
    type: 'condition_or',
    expr: `( ${expr} )`,
  };
}

// ============================================================================
// Main Condition Expression Builder
// ============================================================================

/**
 * Creates a type-safe DynamoDB condition expression
 *
 * @example
 * // Simple comparison
 * const cond1 = conditionExpr<User>(($) =>
 *   $.cond('age', '>', 18)
 * );
 *
 * // AND combination
 * const cond2 = conditionExpr<User>(($) =>
 *   $.and(
 *     $.cond('age', '>=', 21),
 *     $.cond('status', '=', 'active')
 *   )
 * );
 *
 * // Nested OR within AND
 * const cond3 = conditionExpr<User>(($) =>
 *   $.and(
 *     $.cond('age', '>=', 21),
 *     $.or(
 *       $.cond('status', '=', 'active'),
 *       $.cond('status', '=', 'pending')
 *     )
 *   )
 * );
 */
export function conditionExpr<T>(
  builder: (ops: ConditionOps<T>) => AnyCondition<T>,
): ConditionOperation<T> {
  // Create attribute builder for this condition expression
  const attrBuilder = new AttributeMapBuilder('cf_');

  // Build the operations by calling the builder with our ops interface
  const condition = builder({
    cond: (key, op, value) => cond<any>(attrBuilder, key as any, op, value),
    and: (...ops: AnyCondition[]) => and(...ops),
    or: (...ops: AnyCondition[]) => or(...ops),
  });

  // Convert to final ConditionOperation with attribute mappings
  return {
    type: 'condition_operation',
    expr: {
      expr: condition.expr,
      attrResult: attrBuilder.build(),
    },
  };
}

// Simple alias to conditionExpr
export function filterExpr<T>(
  builder: (ops: ConditionOps<T>) => AnyCondition<T>,
): ConditionOperation<T> {
  return conditionExpr(builder);
}
