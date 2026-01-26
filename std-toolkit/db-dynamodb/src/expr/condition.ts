import type { ExprResult, ValidPaths } from "./types.js";
import type { Get, Paths } from "type-fest";
import { AttributeMapBuilder } from "./utils.js";

export type CompiledConditionOperation<T = any> = {
  type: "condition_operation";
  expr: ExprResult;
  value?: T;
};

export type CondOperation<T = any> = {
  type: "condition_condition";
  key: ValidPaths<T>;
  op: "=" | "<>" | "<" | "<=" | ">" | ">=";
  value: any;
};

export type AndOperation<T = any> = {
  type: "condition_and";
  conditions: AnyCondition<T>[];
};

export type OrOperation<T = any> = {
  type: "condition_or";
  conditions: AnyCondition<T>[];
};

export type AttributeNotExistsOperation<T = any> = {
  type: "condition_attribute_not_exists";
  key: ValidPaths<T>;
};

export type AttributeExistsOperation<T = any> = {
  type: "condition_attribute_exists";
  key: ValidPaths<T>;
};

type AnyCondition<T = any> =
  | CondOperation<T>
  | AndOperation<T>
  | OrOperation<T>
  | AttributeNotExistsOperation<T>
  | AttributeExistsOperation<T>;

export type ConditionOperation<T = any> = AnyCondition<T>;

type ValidConditionKeys<T> = T extends any
  ? unknown extends T
    ? string
    : Paths<T, { bracketNotation: true }>
  : never;

type ConditionOps<T> = {
  cond: <Key extends ValidConditionKeys<T>>(
    key: Key,
    op: "=" | "<>" | "<" | "<=" | ">" | ">=",
    value: Get<T, Key>,
  ) => CondOperation;

  and: (...ops: AnyCondition<T>[]) => AndOperation;
  or: (...ops: AnyCondition<T>[]) => OrOperation;

  attributeNotExists: <Key extends ValidConditionKeys<T>>(
    key: Key,
  ) => AttributeNotExistsOperation;

  attributeExists: <Key extends ValidConditionKeys<T>>(
    key: Key,
  ) => AttributeExistsOperation;
};

function cond<T, Key extends ValidPaths<T> = ValidPaths<T>>(
  key: Key,
  op: "=" | "<>" | "<" | "<=" | ">" | ">=",
  value: Get<T, Key>,
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

export function exprCondition<T>(
  builder: (ops: ConditionOps<T>) => AnyCondition<T>,
): ConditionOperation<T> {
  return builder({
    cond: (key, op, value) => cond<any>(key as any, op, value),
    and: (...ops: AnyCondition<T>[]) => and<T>(...ops),
    or: (...ops: AnyCondition<T>[]) => or<T>(...ops),
    attributeNotExists: (key) => attributeNotExists<any>(key as any),
    attributeExists: (key) => attributeExists<any>(key as any),
  });
}

export function exprFilter<T>(
  builder: (ops: ConditionOps<T>) => AnyCondition<T>,
): ConditionOperation<T> {
  return exprCondition(builder);
}

export function compileConditionExpr<T>(
  operation: ConditionOperation<T>,
): CompiledConditionOperation<T> {
  const attrBuilder = new AttributeMapBuilder("cf_");

  function compile(op: AnyCondition<T>): string {
    switch (op.type) {
      case "condition_condition":
        return `${attrBuilder.attr(op.key)} ${op.op} ${attrBuilder.value(op.value)}`;
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
