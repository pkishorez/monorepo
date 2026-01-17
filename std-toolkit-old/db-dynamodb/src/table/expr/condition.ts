import { ExprResult, ValidPaths } from './types.js';
import type { Get, Paths } from 'type-fest';
import { AttributeMapBuilder } from './utils.js';

// ============================================================================
// Core Types
// ============================================================================

/**
 * The final compiled result of a condition expression that can be sent to DynamoDB
 */
export type CompiledConditionOperation<T = any> = {
  type: 'condition_operation';
  expr: ExprResult;
  value?: T;
};

// ============================================================================
// Operation Types - Individual condition operations
// ============================================================================

/**
 * Basic comparison condition - compares an attribute to a value (uncompiled)
 */
export type CondOperation<T = any> = {
  type: 'condition_condition';
  key: ValidPaths<T>;
  op: '=' | '<>' | '<' | '<=' | '>' | '>=';
  value: any;
};

/**
 * AND operation - combines multiple conditions with logical AND (uncompiled)
 */
export type AndOperation<T = any> = {
  type: 'condition_and';
  conditions: AnyCondition<T>[];
};

/**
 * OR operation - combines multiple conditions with logical OR (uncompiled)
 */
export type OrOperation<T = any> = {
  type: 'condition_or';
  conditions: AnyCondition<T>[];
};

/**
 * Attribute not exists operation - checks if an attribute doesn't exist (uncompiled)
 */
export type AttributeNotExistsOperation<T = any> = {
  type: 'condition_attribute_not_exists';
  key: ValidPaths<T>;
};

/**
 * Union of all possible condition operations (uncompiled)
 */
type AnyCondition<T = any> =
  | CondOperation<T>
  | AndOperation<T>
  | OrOperation<T>
  | AttributeNotExistsOperation<T>;

/**
 * Represents a condition operation (uncompiled)
 * Can be composed with other conditions
 */
export type ConditionOperation<T = any> = AnyCondition<T>;

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

  /** Check if an attribute does not exist */
  attributeNotExists: <Key extends ValidConditionKeys<T>>(
    key: Key,
  ) => AttributeNotExistsOperation;
};

// ============================================================================
// Helper Functions - Create individual operations
// ============================================================================

/**
 * Creates a comparison condition (uncompiled)
 * @internal
 */
function cond<T, Key extends ValidPaths<T> = ValidPaths<T>>(
  key: Key,
  op: '=' | '<>' | '<' | '<=' | '>' | '>=',
  value: Get<T, Key>,
): CondOperation<T> {
  return {
    type: 'condition_condition',
    key,
    op,
    value,
  };
}

/**
 * Creates an AND operation by combining multiple conditions (uncompiled)
 * @internal
 */
function and<T>(...ops: AnyCondition<T>[]): AndOperation<T> {
  return {
    type: 'condition_and',
    conditions: ops,
  };
}

/**
 * Creates an OR operation by combining multiple conditions (uncompiled)
 * @internal
 */
function or<T>(...ops: AnyCondition<T>[]): OrOperation<T> {
  return {
    type: 'condition_or',
    conditions: ops,
  };
}

/**
 * Creates an attribute not exists condition (uncompiled)
 * @internal
 */
function attributeNotExists<T, Key extends ValidPaths<T> = ValidPaths<T>>(
  key: Key,
): AttributeNotExistsOperation<T> {
  return {
    type: 'condition_attribute_not_exists',
    key,
  };
}

// ============================================================================
// Main Condition Expression Builder
// ============================================================================

/**
 * Creates a type-safe DynamoDB condition expression (uncompiled)
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
 *
 * // Composition with existing conditions
 * const cond4 = conditionExpr<User>(($) =>
 *   $.and(cond1, cond2)  // Compose existing conditions
 * );
 */
export function conditionExpr<T>(
  builder: (ops: ConditionOps<T>) => AnyCondition<T>,
): ConditionOperation<T> {
  // Just build and return the operations - no compilation
  return builder({
    cond: (key, op, value) => cond<any>(key as any, op, value),
    and: (...ops: AnyCondition<T>[]) => and<T>(...ops),
    or: (...ops: AnyCondition<T>[]) => or<T>(...ops),
    attributeNotExists: (key) => attributeNotExists<any>(key as any),
  });
}

// Simple alias to conditionExpr
export function filterExpr<T>(
  builder: (ops: ConditionOps<T>) => AnyCondition<T>,
): ConditionOperation<T> {
  return conditionExpr(builder);
}

// ============================================================================
// Condition Expression Compiler
// ============================================================================

/**
 * Compiles condition operations into DynamoDB expression syntax
 *
 * @example
 * const ops = conditionExpr<User>(($) => $.cond('age', '>', 18));
 * const compiled = compileConditionExpr(ops);
 * // compiled.expr.expr => "#cf_0 > :cf_0"
 */
export function compileConditionExpr<T>(
  operation: ConditionOperation<T>,
): CompiledConditionOperation<T> {
  const attrBuilder = new AttributeMapBuilder('cf_');

  // Recursive compilation function
  function compile(op: AnyCondition<T>): string {
    switch (op.type) {
      case 'condition_condition':
        return `${attrBuilder.attr(op.key)} ${op.op} ${attrBuilder.value(op.value)}`;
      case 'condition_and': {
        const exprs = op.conditions.map(compile);
        return `${exprs.join(' AND ')}`;
      }
      case 'condition_or': {
        const exprs = op.conditions.map(compile);
        return `${exprs.join(' OR ')}`;
      }
      case 'condition_attribute_not_exists':
        return `attribute_not_exists(${attrBuilder.attr(op.key)})`;
    }
  }

  return {
    type: 'condition_operation',
    expr: {
      expr: compile(operation),
      attrResult: attrBuilder.build(),
    },
  };
}
