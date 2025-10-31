import { ExprResult, ValidPaths, ValidPathsWithCond } from './types.js';
import type { Get } from 'type-fest';
import { AttributeMapBuilder } from './utils.js';

// ============================================================================
// Core Types
// ============================================================================

/**
 * The final result of an update expression that can be sent to DynamoDB
 */
export type UpdateOperation<T = any> = {
  type: 'update_operation';
  exprResult: ExprResult;
  value?: T;
};

// ============================================================================
// Operation Types - Individual update operations
// ============================================================================

/**
 * SET operation - assigns a value to an attribute
 * Can also be used for arithmetic operations when value is AddOp
 */
export type SetOperation<T, Key extends ValidPaths<T> = ValidPaths<T>> = {
  type: 'update_set_value';
  key: Key;
  value: Get<T, Key> | (Get<T, Key> extends number ? AddOp<T> : never);
};

/**
 * ADD operation helper - represents an addition of two values
 * Used within SET operations for numeric additions
 */
type AddOp<T> = {
  type: 'update_primitive_add_op';
  key: ValidPathsWithCond<T, number>;
  value: number;
};

/**
 * APPEND operation - appends elements to the end of a list
 */
type SetAppendOperation<
  T,
  Path extends ValidPathsWithCond<T, any[]> = ValidPathsWithCond<T, any[]>,
> = {
  type: 'update_set_append';
  key: Path;
  value: Get<T, Path>;
};

/**
 * PREPEND operation - prepends elements to the beginning of a list
 */
type SetPrependOperation<
  T,
  Path extends ValidPathsWithCond<T, any[]> = ValidPathsWithCond<T, any[]>,
> = {
  type: 'update_set_prepend';
  key: Path;
  value: Get<T, Path>;
};

/**
 * Union of all possible operations
 */
type AnyOperation<T> =
  | SetOperation<T>
  | SetAppendOperation<T>
  | SetPrependOperation<T>;

// ============================================================================
// Operation Builder Interface
// ============================================================================

/**
 * Builder interface that provides helper methods for creating update operations
 * This is the interface passed to the callback in updateExpr
 */
type UpdateOps<T> = {
  /** Set an attribute to a value or arithmetic expression */
  set: <Key extends ValidPaths<T>>(
    key: Key,
    value: Get<T, Key> | (Get<T, Key> extends number ? AddOp<T> : never),
  ) => SetOperation<T, Key>;

  /** Create an ADD operation for numeric fields (attribute + value) */
  addOp: (key: ValidPathsWithCond<T, number>, value: number) => AddOp<T>;

  /** Append elements to the end of a list */
  append: <Path extends ValidPathsWithCond<T, any[]>>(
    key: Path,
    value: Get<T, Path>,
  ) => SetAppendOperation<T, Path>;

  /** Prepend elements to the beginning of a list */
  prepend: <Path extends ValidPathsWithCond<T, any[]>>(
    key: Path,
    value: Get<T, Path>,
  ) => SetPrependOperation<T, Path>;
};

// ============================================================================
// Helper Functions - Create individual operations
// ============================================================================

/**
 * Creates a SET operation
 */
function set<T, Key extends ValidPaths<T> = ValidPaths<T>>(
  key: Key,
  value: Get<T, Key> | (Get<T, Key> extends number ? AddOp<T> : never),
): SetOperation<T, Key> {
  return {
    type: 'update_set_value',
    key,
    value,
  } as SetOperation<T, Key>;
}

/**
 * Creates an ADD operation helper for numeric additions
 * @example
 * $.set('count', $.addOp('count', 5)) // count = count + 5
 */
export function addOp<T>(
  key: ValidPathsWithCond<T, number>,
  value: number,
): AddOp<T> {
  return {
    type: 'update_primitive_add_op',
    key,
    value,
  };
}

/**
 * Creates an APPEND operation to add elements to the end of a list
 * @example
 * $.append('tags', ['new-tag']) // tags = list_append(tags, ['new-tag'])
 */
function append<
  T,
  Path extends ValidPathsWithCond<T, any[]> = ValidPathsWithCond<T, any[]>,
>(key: Path, value: Get<T, Path>): SetAppendOperation<T, Path> {
  return {
    type: 'update_set_append',
    key,
    value,
  };
}

/**
 * Creates a PREPEND operation to add elements to the beginning of a list
 * @example
 * $.prepend('tags', ['new-tag']) // tags = list_append(['new-tag'], tags)
 */
function prepend<
  T,
  Path extends ValidPathsWithCond<T, any[]> = ValidPathsWithCond<T, any[]>,
>(key: Path, value: Get<T, Path>): SetPrependOperation<T, Path> {
  return {
    type: 'update_set_prepend',
    key,
    value,
  };
}

// ============================================================================
// Main Update Expression Builder
// ============================================================================

/**
 * Creates a type-safe DynamoDB update expression
 *
 * @example
 * // Callback style with automatic typing
 * const update = updateExpr<User>(($) => [
 *   $.set('age', 25),                       // Set a value
 *   $.set('count', $.addOp('count', 5)),   // Arithmetic operation
 *   $.append('tags', ['new-tag']),         // Append to list
 *   $.prepend('items', ['first-item'])     // Prepend to list
 * ]);
 */
export function updateExpr<T>(
  builder: (ops: UpdateOps<T>) => AnyOperation<T>[],
): UpdateOperation<T> {
  // Build the operations array by calling the builder with our ops interface
  const ops = builder({
    set: (key, value) => set<any, any>(key, value),
    addOp: (key: ValidPathsWithCond<T, number>, value: number) =>
      addOp<T>(key, value),
    append: (key, value) => append<any, any>(key, value),
    prepend: (key, value) => prepend<any, any>(key, value),
  });

  // Convert operations to DynamoDB expression syntax
  const attrBuilder = new AttributeMapBuilder('u_');
  const setOps = ops
    .map((op) => {
      switch (op.type) {
        case 'update_set_value':
          // Check if value is an AddOp (arithmetic operation)
          if (op.value && typeof op.value === 'object' && 'type' in op.value) {
            return `${attrBuilder.attr(op.key)} = ${attrBuilder.attr(op.value.key)} + ${attrBuilder.value(op.value.value)}`;
          }
          // Simple value assignment
          return `${attrBuilder.attr(op.key)} = ${attrBuilder.value(op.value)}`;

        case 'update_set_append':
          const aKey = attrBuilder.attr(op.key);
          return `${aKey} = list_append(${aKey}, ${attrBuilder.value(op.value)})`;

        case 'update_set_prepend':
          const pKey = attrBuilder.attr(op.key);
          return `${pKey} = list_append(${attrBuilder.value(op.value)}, ${pKey})`;
      }
    })
    .join(', ');

  return {
    type: 'update_operation',
    exprResult: {
      expr: `SET ${setOps}`,
      attrResult: attrBuilder.build(),
    },
  };
}
