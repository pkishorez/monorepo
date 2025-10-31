import { ExprResult, ValidPaths, ValidPathsWithCond } from './types.js';
import type { Get } from 'type-fest';
import { AttributeMapBuilder } from './utils.js';

export type UpdateOperation<T = any> = {
  type: 'update_operation';
  exprResult: ExprResult;
  value?: T;
};
export type SetOperation<T, Key extends ValidPaths<T> = ValidPaths<T>> = {
  type: 'update_set_value';
  key: Key;
  value: Get<T, Key> | (Get<T, Key> extends number ? AddOp<T> : never);
};
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
    value: Get<T, Key> | (Get<T, Key> extends number ? AddOp<T> : never),
  ) => SetOperation<T, Key>;
  addOp: (key: ValidPathsWithCond<T, number>, value: number) => AddOp<T>;
};

// Overload 1: Callback style with automatic type context
export function updateExpr<T = any>(
  builder: (
    ops: UpdateOps<T>,
  ) => (SetOperation<T> | SetAppendOperation<T> | SetPrependOperation<T>)[],
): UpdateOperation<T>;

// Implementation
export function updateExpr<T>(
  opsOrBuilder: (
    ops: UpdateOps<T>,
  ) => (SetOperation<T> | SetAppendOperation<T> | SetPrependOperation<T>)[],
): UpdateOperation<T> {
  // If it's a function, call it with the ops builder
  const ops =
    typeof opsOrBuilder === 'function'
      ? opsOrBuilder({
          set: (key, value) => set<any, any>(key, value),
          addOp: (key: ValidPathsWithCond<T, number>, value: number) =>
            addOp<T>(key, value),
        })
      : opsOrBuilder;

  const attrBuilder = new AttributeMapBuilder('update_');
  const setOps = ops
    .map((op) => {
      switch (op.type) {
        case 'update_set_value':
          if (op.value && typeof op.value === 'object' && 'type' in op.value) {
            return `${attrBuilder.attr(op.key)} = ${attrBuilder.attr(op.value.key)} + ${attrBuilder.value(op.value.value)}`;
          }
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
