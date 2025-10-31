import { ExprResult, ValidPaths, ValidPathsWithCond } from './types.js';
import type { Get } from 'type-fest';
import { AttributeMapBuilder } from './utils.js';

export type UpdateOperation<T = any> = {
  type: 'update_operation';
  exprResult: ExprResult;
  value?: T;
};
export type SetOperation<T> = {
  type: 'update_set_value';
  key: ValidPaths<T>;
  value: Get<T, ValidPaths<T>>;
};
export function set<T, Key extends ValidPaths<T> = ValidPaths<T>>(
  key: Key,
  value: Get<T, Key>,
): SetOperation<T> {
  return {
    type: 'update_set_value',
    key,
    value,
  } as SetOperation<T>;
}
type SetAddOperation<T> = {
  type: 'update_set_add';
  key: ValidPathsWithCond<T, number>;
  value: number | AddOp<T>;
};
export function setAdd<T>(
  key: ValidPathsWithCond<T, number>,
  value: number | AddOp<T>,
): SetAddOperation<T> {
  return {
    type: 'update_set_add',
    key,
    value,
  };
}
type AddOp<T> = {
  type: 'update_primitive_add_op';
  key: ValidPathsWithCond<T, number>;
  value: number;
};
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
type SetAppendOperation<
  T,
  Path extends ValidPathsWithCond<T, any[]> = ValidPathsWithCond<T, any[]>,
> = {
  type: 'update_set_append';
  key: Path;
  value: Get<T, Path>;
};
type SetPrependOperation<
  T,
  Path extends ValidPathsWithCond<T, any[]> = ValidPathsWithCond<T, any[]>,
> = {
  type: 'update_set_prepend';
  key: Path;
  value: Get<T, Path>;
};

type UpdateOps<T> = {
  set: <Key extends ValidPaths<T>>(
    key: Key,
    value: Get<T, Key>,
  ) => SetOperation<T>;
  setAdd: (
    key: ValidPathsWithCond<T, number>,
    value: number | AddOp<T>,
  ) => SetAddOperation<T>;
  addOp: (key: ValidPathsWithCond<T, number>, value: number) => AddOp<T>;
};

// Overload 1: Callback style with automatic type context
export function updateExpr<T = any>(
  builder: (
    ops: UpdateOps<T>,
  ) => (
    | SetOperation<T>
    | SetAddOperation<T>
    | SetAppendOperation<T>
    | SetPrependOperation<T>
  )[],
): UpdateOperation<T>;

// Implementation
export function updateExpr<T>(
  opsOrBuilder: (
    ops: UpdateOps<T>,
  ) => (
    | SetOperation<T>
    | SetAddOperation<T>
    | SetAppendOperation<T>
    | SetPrependOperation<T>
  )[],
): UpdateOperation<T> {
  // If it's a function, call it with the ops builder
  const ops =
    typeof opsOrBuilder === 'function'
      ? opsOrBuilder({
          set: <Key extends ValidPaths<T>>(key: Key, value: Get<T, Key>) =>
            set<T, Key>(key, value),
          setAdd: (
            key: ValidPathsWithCond<T, number>,
            value: number | AddOp<T>,
          ) => setAdd<T>(key, value),
          addOp: (key: ValidPathsWithCond<T, number>, value: number) =>
            addOp<T>(key, value),
        })
      : opsOrBuilder;

  const attrBuilder = new AttributeMapBuilder('update_');
  const setOps = ops
    .map((op) => {
      switch (op.type) {
        case 'update_set_value':
          return `${attrBuilder.attr(op.key)} = ${attrBuilder.value(op.value)}`;
        case 'update_set_add':
          if (typeof op.value === 'number') {
            return `${attrBuilder.attr(op.key)} = ${attrBuilder.attr(op.key)} + ${attrBuilder.value(op.value)}`;
          }
          return `${attrBuilder.attr(op.key)} = ${attrBuilder.attr(op.value.key)} + ${attrBuilder.value(op.value.value)}`;
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
