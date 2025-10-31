import { Match } from 'effect';
import { ExprResult } from './types.js';
import type { Paths } from 'type-fest';
import { AttributeMapBuilder } from './utils.js';

export type ConditionOperation = {
  type: 'condition_operation';
  expr: ExprResult;
};
export type CondOperation = {
  type: 'condition_condition';
  expr: string;
};
export type AndOperation = {
  type: 'condition_and';
  expr: string;
};
export type OrOperation = {
  type: 'condition_or';
  expr: string;
};

// Primitives
type CondAttrPath = {
  type: 'cond_attr_path';
  path: string;
};
type CondAttrValue = {
  type: 'cond_attr_value';
  value: unknown;
};
export const conditionBuilder = <T>() => {
  const attrBuilder = new AttributeMapBuilder('update_');
  type ValidKeys = Paths<T, { bracketNotation: true }>;

  const cond = (
    left: CondAttrPath,
    op: '=' | '<>' | '<' | '<=' | '>' | '>=',
    right: CondAttrPath | CondAttrValue,
  ): CondOperation => {
    return {
      type: 'condition_condition',
      expr: `${attrBuilder.attr(left.path)} ${op} ${right.type === 'cond_attr_path' ? attrBuilder.attr(right.path) : attrBuilder.value(right.value)}`,
    };
  };

  const attr = (path: ValidKeys): CondAttrPath => ({
    type: 'cond_attr_path',
    path,
  });
  const value = (value: unknown): CondAttrValue => ({
    type: 'cond_attr_value',
    value,
  });
  const and = (...ops: (CondOperation | AndOperation)[]): AndOperation => {
    const expr = ops
      .map((op) =>
        Match.value(op).pipe(
          Match.when({ type: 'condition_and' }, (v) => v.expr),
          Match.when({ type: 'condition_condition' }, (v) => v.expr),
          Match.exhaustive,
        ),
      )
      .join(' AND ');
    return {
      type: 'condition_and',
      expr: `( ${expr} )`,
    };
  };
  const or = (...ops: (CondOperation | OrOperation)[]): OrOperation => {
    const expr = ops
      .map((op) =>
        Match.value(op).pipe(
          Match.when({ type: 'condition_or' }, (v) => v.expr),
          Match.when({ type: 'condition_condition' }, (v) => v.expr),
          Match.exhaustive,
        ),
      )
      .join(' OR ');
    return {
      type: 'condition_or',
      expr: `( ${expr} )`,
    };
  };

  const result = (
    ops: CondOperation | AndOperation | OrOperation,
  ): ConditionOperation | null => {
    return {
      type: 'condition_operation',
      expr: {
        expr: ops.expr,
        attrResult: attrBuilder.build(),
      },
    };
  };
  return {
    cond,
    attr,
    value,
    and,
    or,

    result,
  };
};

export type ConditionOperations<T> = ReturnType<typeof conditionBuilder<T>>;
