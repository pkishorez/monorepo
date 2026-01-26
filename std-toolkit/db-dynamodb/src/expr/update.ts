import type { ExprResult, ValidPaths, ValidPathsWithCond } from "./types.js";
import type { Get } from "type-fest";
import { AttributeMapBuilder } from "./utils.js";

/**
 * A compiled update operation ready for use in DynamoDB requests.
 *
 * @typeParam T - The entity type this update operates on
 */
export type CompiledUpdateOperation<T = any> = {
  type: "update_operation";
  exprResult: ExprResult;
  value?: T;
};

/**
 * A SET operation that assigns a value to an attribute.
 *
 * @typeParam T - The entity type
 * @typeParam Key - The path to the attribute being set
 */
export type SetOperation<T, Key extends ValidPaths<T> = ValidPaths<T>> = {
  type: "update_set_value";
  key: Key;
  value:
    | Get<T, Key>
    | (Get<T, Key> extends number ? AddOp<T> : never)
    | IfNotExistsOp<T, Key>;
};

/**
 * An arithmetic add operation for numeric attributes.
 *
 * @typeParam T - The entity type
 */
type AddOp<T> = {
  type: "update_primitive_add_op";
  key: ValidPathsWithCond<T, number>;
  value: number;
};

/**
 * A conditional set operation that only sets if the attribute doesn't exist.
 *
 * @typeParam T - The entity type
 * @typeParam Key - The path to the attribute
 */
type IfNotExistsOp<T, Key extends ValidPaths<T> = ValidPaths<T>> = {
  type: "update_if_not_exists_op";
  key: Key;
  value: Get<T, Key>;
};

/**
 * An operation that appends values to a list attribute.
 *
 * @typeParam T - The entity type
 * @typeParam Path - The path to the list attribute
 */
type SetAppendOperation<
  T,
  Path extends ValidPathsWithCond<T, any[]> = ValidPathsWithCond<T, any[]>,
> = {
  type: "update_set_append";
  key: Path;
  value: Get<T, Path>;
};

/**
 * An operation that prepends values to a list attribute.
 *
 * @typeParam T - The entity type
 * @typeParam Path - The path to the list attribute
 */
type SetPrependOperation<
  T,
  Path extends ValidPathsWithCond<T, any[]> = ValidPathsWithCond<T, any[]>,
> = {
  type: "update_set_prepend";
  key: Path;
  value: Get<T, Path>;
};

/**
 * Union of all possible update operation types.
 */
type AnyOperation<T> =
  | SetOperation<T>
  | SetAppendOperation<T>
  | SetPrependOperation<T>
  | UpdateOperation<T>;

/**
 * An array of update operations to be applied together.
 *
 * @typeParam T - The entity type this update operates on
 */
export type UpdateOperation<T = any> = AnyOperation<T>[];

/**
 * Operations available in the update builder callback.
 *
 * @typeParam T - The entity type the updates operate on
 */
type UpdateOps<T> = {
  /** Sets an attribute to a value, optionally with add or if_not_exists modifiers */
  set: <Key extends ValidPaths<T>>(
    key: Key,
    value:
      | Get<T, Key>
      | (Get<T, Key> extends number ? AddOp<T> : never)
      | IfNotExistsOp<T>,
  ) => SetOperation<T, Key>;

  /** Creates an add operation for incrementing numeric attributes */
  opAdd: (key: ValidPathsWithCond<T, number>, value: number) => AddOp<T>;

  /** Creates an if_not_exists operation for conditional setting */
  opIfNotExists: <Key extends ValidPaths<T>>(
    key: Key,
    value: Get<T, Key>,
  ) => IfNotExistsOp<T, Key>;

  /** Appends values to the end of a list attribute */
  append: <Path extends ValidPathsWithCond<T, any[]>>(
    key: Path,
    value: Get<T, Path>,
  ) => SetAppendOperation<T, Path>;

  /** Prepends values to the beginning of a list attribute */
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

/**
 * Creates an add operation for incrementing a numeric attribute.
 *
 * @typeParam T - The entity type
 * @param key - Path to the numeric attribute
 * @param value - Amount to add (can be negative for subtraction)
 * @returns An AddOp to use with set()
 */
export function opAdd<T>(
  key: ValidPathsWithCond<T, number>,
  value: number,
): AddOp<T> {
  return { type: "update_primitive_add_op", key, value };
}

/**
 * Creates an if_not_exists operation for conditional attribute setting.
 *
 * @typeParam T - The entity type
 * @typeParam Key - The path to the attribute
 * @param key - Path to the attribute
 * @param value - Default value if attribute doesn't exist
 * @returns An IfNotExistsOp to use with set()
 */
export function opIfNotExists<T, Key extends ValidPaths<T>>(
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

/**
 * Creates an update expression using a type-safe builder pattern.
 *
 * @typeParam T - The entity type the update operates on
 * @param builder - Callback that receives update operations and returns an array of operations
 * @returns An array of update operations ready for compilation
 *
 * @example
 * ```ts
 * const update = exprUpdate<User>(({ set, opAdd }) => [
 *   set("name", "John"),
 *   set("loginCount", opAdd("loginCount", 1))
 * ]);
 * ```
 */
export function exprUpdate<T>(
  builder: (ops: UpdateOps<T>) => AnyOperation<T>[],
): UpdateOperation<T> {
  return builder({
    set: (key, value) => set<any, any>(key, value),
    opAdd: (key: ValidPathsWithCond<T, number>, value: number) =>
      opAdd<T>(key, value),
    opIfNotExists: (key, value) => opIfNotExists<any, any>(key, value),
    append: (key, value) => append<any, any>(key, value),
    prepend: (key, value) => prepend<any, any>(key, value),
  });
}

/**
 * Flattens nested operation arrays into a single array.
 */
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

/**
 * Compiles an update operation into a DynamoDB-ready expression.
 *
 * @typeParam T - The entity type the update operates on
 * @param operations - The update operations to compile
 * @returns A compiled update with expression string and attribute maps
 */
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
