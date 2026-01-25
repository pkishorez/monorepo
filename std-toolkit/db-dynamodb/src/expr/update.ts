import type { ExprResult, ValidPaths, ValidPathsWithCond } from "./types.js";
import type { Get } from "type-fest";
import { AttributeMapBuilder } from "./utils.js";

export type CompiledUpdateOperation<T = any> = {
  type: "update_operation";
  exprResult: ExprResult;
  value?: T;
};

export type SetOperation<T, Key extends ValidPaths<T> = ValidPaths<T>> = {
  type: "update_set_value";
  key: Key;
  value:
    | Get<T, Key>
    | (Get<T, Key> extends number ? AddOp<T> : never)
    | IfNotExistsOp<T, Key>;
};

type AddOp<T> = {
  type: "update_primitive_add_op";
  key: ValidPathsWithCond<T, number>;
  value: number;
};

type IfNotExistsOp<T, Key extends ValidPaths<T> = ValidPaths<T>> = {
  type: "update_if_not_exists_op";
  key: Key;
  value: Get<T, Key>;
};

type SetAppendOperation<
  T,
  Path extends ValidPathsWithCond<T, any[]> = ValidPathsWithCond<T, any[]>,
> = {
  type: "update_set_append";
  key: Path;
  value: Get<T, Path>;
};

type SetPrependOperation<
  T,
  Path extends ValidPathsWithCond<T, any[]> = ValidPathsWithCond<T, any[]>,
> = {
  type: "update_set_prepend";
  key: Path;
  value: Get<T, Path>;
};

type AnyOperation<T> =
  | SetOperation<T>
  | SetAppendOperation<T>
  | SetPrependOperation<T>
  | UpdateOperation<T>;

export type UpdateOperation<T = any> = AnyOperation<T>[];

type UpdateOps<T> = {
  set: <Key extends ValidPaths<T>>(
    key: Key,
    value:
      | Get<T, Key>
      | (Get<T, Key> extends number ? AddOp<T> : never)
      | IfNotExistsOp<T>,
  ) => SetOperation<T, Key>;

  addOp: (key: ValidPathsWithCond<T, number>, value: number) => AddOp<T>;

  ifNotExistsOp: <Key extends ValidPaths<T>>(
    key: Key,
    value: Get<T, Key>,
  ) => IfNotExistsOp<T, Key>;

  append: <Path extends ValidPathsWithCond<T, any[]>>(
    key: Path,
    value: Get<T, Path>,
  ) => SetAppendOperation<T, Path>;

  prepend: <Path extends ValidPathsWithCond<T, any[]>>(
    key: Path,
    value: Get<T, Path>,
  ) => SetPrependOperation<T, Path>;
};

function set<T, Key extends ValidPaths<T> = ValidPaths<T>>(
  key: Key,
  value: Get<T, Key> | (Get<T, Key> extends number ? AddOp<T> : never),
): SetOperation<T, Key> {
  return { type: "update_set_value", key, value } as SetOperation<T, Key>;
}

export function addOp<T>(
  key: ValidPathsWithCond<T, number>,
  value: number,
): AddOp<T> {
  return { type: "update_primitive_add_op", key, value };
}

export function ifNotExists<T, Key extends ValidPaths<T>>(
  key: Key,
  value: Get<T, Key>,
): IfNotExistsOp<T, Key> {
  return { type: "update_if_not_exists_op", key, value };
}

function append<
  T,
  Path extends ValidPathsWithCond<T, any[]> = ValidPathsWithCond<T, any[]>,
>(key: Path, value: Get<T, Path>): SetAppendOperation<T, Path> {
  return { type: "update_set_append", key, value };
}

function prepend<
  T,
  Path extends ValidPathsWithCond<T, any[]> = ValidPathsWithCond<T, any[]>,
>(key: Path, value: Get<T, Path>): SetPrependOperation<T, Path> {
  return { type: "update_set_prepend", key, value };
}

export function updateExpr<T>(
  builder: (ops: UpdateOps<T>) => AnyOperation<T>[],
): UpdateOperation<T> {
  return builder({
    set: (key, value) => set<any, any>(key, value),
    addOp: (key: ValidPathsWithCond<T, number>, value: number) =>
      addOp<T>(key, value),
    ifNotExistsOp: (key, value) => ifNotExists<any, any>(key, value),
    append: (key, value) => append<any, any>(key, value),
    prepend: (key, value) => prepend<any, any>(key, value),
  });
}

function flattenOperations<T>(
  ops: AnyOperation<T>[],
): (SetOperation<T> | SetAppendOperation<T> | SetPrependOperation<T>)[] {
  const result: (
    | SetOperation<T>
    | SetAppendOperation<T>
    | SetPrependOperation<T>
  )[] = [];

  for (const op of ops) {
    if (Array.isArray(op)) {
      result.push(...flattenOperations(op));
    } else {
      result.push(op);
    }
  }

  return result;
}

export function compileUpdateExpr<T>(
  operations: UpdateOperation<T>,
): CompiledUpdateOperation<T> {
  const flatOps = flattenOperations(operations);
  const attrBuilder = new AttributeMapBuilder("u_");

  const setOps = flatOps
    .map((op) => {
      switch (op.type) {
        case "update_set_value":
          if (op.value && typeof op.value === "object" && "type" in op.value) {
            if (op.value.type === "update_primitive_add_op") {
              return `${attrBuilder.attr(op.key)} = ${attrBuilder.attr(op.value.key)} + ${attrBuilder.value(op.value.value)}`;
            } else if (op.value.type === "update_if_not_exists_op") {
              return `${attrBuilder.attr(op.key)} = if_not_exists(${attrBuilder.attr(op.value.key)}, ${attrBuilder.value(op.value.value)})`;
            }
          }
          return `${attrBuilder.attr(op.key)} = ${attrBuilder.value(op.value)}`;

        case "update_set_append": {
          const aKey = attrBuilder.attr(op.key);
          return `${aKey} = list_append(${aKey}, ${attrBuilder.value(op.value)})`;
        }

        case "update_set_prepend": {
          const pKey = attrBuilder.attr(op.key);
          return `${pKey} = list_append(${attrBuilder.value(op.value)}, ${pKey})`;
        }
      }
    })
    .join(", ");

  return {
    type: "update_operation",
    exprResult: {
      expr: `SET ${setOps}`,
      attrResult: attrBuilder.build(),
    },
  };
}
