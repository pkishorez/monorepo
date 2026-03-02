import type { ExprResult, ValidPaths } from "./types.js";
import type { Get, Paths } from "type-fest";
import { AttributeMapBuilder } from "./utils.js";

/**
 * A compiled condition operation ready for use in DynamoDB requests.
 *
 * @typeParam T - The entity type this condition operates on
 */
export type CompiledConditionOperation<T = any> = {
  type: "condition_operation";
  expr: ExprResult;
  value?: T;
};

/**
 * A reference to another field, used for field-to-field comparisons.
 *
 * @typeParam T - The entity type this reference operates on
 */
export type FieldRef<T = any> = {
  readonly type: "field_ref";
  readonly key: ValidPaths<T>;
};

/**
 * A comparison condition operation (=, <>, <, <=, >, >=).
 *
 * @typeParam T - The entity type this condition operates on
 */
export type CondOperation<T = any> = {
  type: "condition_condition";
  key: ValidPaths<T>;
  op: "=" | "<>" | "<" | "<=" | ">" | ">=";
  value: any | FieldRef<T>;
};

/**
 * Logical AND operation combining multiple conditions.
 *
 * @typeParam T - The entity type this condition operates on
 */
export type AndOperation<T = any> = {
  type: "condition_and";
  conditions: AnyCondition<T>[];
};

/**
 * Logical OR operation combining multiple conditions.
 *
 * @typeParam T - The entity type this condition operates on
 */
export type OrOperation<T = any> = {
  type: "condition_or";
  conditions: AnyCondition<T>[];
};

/**
 * Condition that checks if an attribute does not exist.
 *
 * @typeParam T - The entity type this condition operates on
 */
export type AttributeNotExistsOperation<T = any> = {
  type: "condition_attribute_not_exists";
  key: ValidPaths<T>;
};

/**
 * Condition that checks if an attribute exists.
 *
 * @typeParam T - The entity type this condition operates on
 */
export type AttributeExistsOperation<T = any> = {
  type: "condition_attribute_exists";
  key: ValidPaths<T>;
};

/**
 * Union of all possible condition operation types.
 */
type AnyCondition<T = any> =
  | CondOperation<T>
  | AndOperation<T>
  | OrOperation<T>
  | AttributeNotExistsOperation<T>
  | AttributeExistsOperation<T>;

/**
 * Any condition operation that can be used in a DynamoDB expression.
 *
 * @typeParam T - The entity type this condition operates on
 */
export type ConditionOperation<T = any> = AnyCondition<T>;

/**
 * Valid keys for condition operations, handling any types.
 */
type ValidConditionKeys<T> = T extends any
  ? unknown extends T
    ? string
    : Paths<T, { bracketNotation: true }>
  : never;

/**
 * Operations available in the condition builder callback.
 *
 * @typeParam T - The entity type the conditions operate on
 */
type ConditionOps<T> = {
  /** Creates a reference to another field for field-to-field comparisons */
  ref: <Key extends ValidConditionKeys<T>>(key: Key) => FieldRef<T>;

  /** Creates a comparison condition */
  cond: <Key extends ValidConditionKeys<T>>(
    key: Key,
    op: "=" | "<>" | "<" | "<=" | ">" | ">=",
    value: Get<T, Key> | FieldRef<T>,
  ) => CondOperation;

  /** Combines conditions with logical AND */
  and: (...ops: AnyCondition<T>[]) => AndOperation;

  /** Combines conditions with logical OR */
  or: (...ops: AnyCondition<T>[]) => OrOperation;

  /** Checks that an attribute does not exist */
  attributeNotExists: <Key extends ValidConditionKeys<T>>(
    key: Key,
  ) => AttributeNotExistsOperation;

  /** Checks that an attribute exists */
  attributeExists: <Key extends ValidConditionKeys<T>>(
    key: Key,
  ) => AttributeExistsOperation;
};

function ref<T, Key extends ValidPaths<T> = ValidPaths<T>>(
  key: Key,
): FieldRef<T> {
  return { type: "field_ref", key };
}

function cond<T, Key extends ValidPaths<T> = ValidPaths<T>>(
  key: Key,
  op: "=" | "<>" | "<" | "<=" | ">" | ">=",
  value: Get<T, Key> | FieldRef<T>,
): CondOperation<T> {
  return { type: "condition_condition", key, op, value };
}

function and<T>(...ops: AnyCondition<T>[]): AndOperation<T> {
  return { type: "condition_and", conditions: ops };
}

function or<T>(...ops: AnyCondition<T>[]): OrOperation<T> {
  return { type: "condition_or", conditions: ops };
}

function attributeNotExists<T, Key extends ValidPaths<T> = ValidPaths<T>>(
  key: Key,
): AttributeNotExistsOperation<T> {
  return { type: "condition_attribute_not_exists", key };
}

function attributeExists<T, Key extends ValidPaths<T> = ValidPaths<T>>(
  key: Key,
): AttributeExistsOperation<T> {
  return { type: "condition_attribute_exists", key };
}

/**
 * Creates a condition expression using a type-safe builder pattern.
 *
 * @typeParam T - The entity type the condition operates on
 * @param builder - Callback that receives condition operations and returns a condition
 * @returns A condition operation ready for compilation
 *
 * @example
 * ```ts
 * const condition = exprCondition<User>(({ cond, and }) =>
 *   and(
 *     cond("status", "=", "active"),
 *     cond("age", ">=", 18)
 *   )
 * );
 * ```
 */
export function exprCondition<T>(
  builder: (ops: ConditionOps<T>) => AnyCondition<T>,
): ConditionOperation<T> {
  return builder({
    ref: (key) => ref<any>(key as any),
    cond: (key, op, value) => cond<any>(key as any, op, value),
    and: (...ops: AnyCondition<T>[]) => and<T>(...ops),
    or: (...ops: AnyCondition<T>[]) => or<T>(...ops),
    attributeNotExists: (key) => attributeNotExists<any>(key as any),
    attributeExists: (key) => attributeExists<any>(key as any),
  });
}

/**
 * Creates a filter expression using the same builder pattern as exprCondition.
 * Alias for exprCondition, used semantically for query filter expressions.
 *
 * @typeParam T - The entity type the filter operates on
 * @param builder - Callback that receives condition operations and returns a condition
 * @returns A condition operation ready for compilation
 */
export function exprFilter<T>(
  builder: (ops: ConditionOps<T>) => AnyCondition<T>,
): ConditionOperation<T> {
  return exprCondition(builder);
}

/**
 * Compiles a condition operation into a DynamoDB-ready expression.
 *
 * @typeParam T - The entity type the condition operates on
 * @param operation - The condition operation to compile
 * @returns A compiled condition with expression string and attribute maps
 */
export function compileConditionExpr<T>(
  operation: ConditionOperation<T>,
): CompiledConditionOperation<T> {
  const attrBuilder = new AttributeMapBuilder("cf_");

  function compile(op: AnyCondition<T>): string {
    switch (op.type) {
      case "condition_condition": {
        const left = attrBuilder.attr(op.key);
        const right =
          op.value?.type === "field_ref"
            ? attrBuilder.attr(op.value.key)
            : attrBuilder.value(op.value);
        return `${left} ${op.op} ${right}`;
      }
      case "condition_and": {
        const exprs = op.conditions.map(compile);
        return `${exprs.join(" AND ")}`;
      }
      case "condition_or": {
        const exprs = op.conditions.map(compile);
        return `${exprs.join(" OR ")}`;
      }
      case "condition_attribute_not_exists":
        return `attribute_not_exists(${attrBuilder.attr(op.key)})`;
      case "condition_attribute_exists":
        return `attribute_exists(${attrBuilder.attr(op.key)})`;
    }
  }

  return {
    type: "condition_operation",
    expr: {
      expr: compile(operation),
      attrResult: attrBuilder.build(),
    },
  };
}
