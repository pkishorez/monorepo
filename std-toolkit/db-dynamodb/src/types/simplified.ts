/**
 * Comparison operators for simplified query API.
 */
export type Operator = "<" | "<=" | ">" | ">=";

/**
 * Key operation type that wraps a value with a comparison operator.
 * Used for the simplified query API.
 *
 * @typeParam T - The type of the key value
 *
 * @example
 * ```ts
 * const op: KeyOp<{ userId: string }> = { ">=": { userId: "123" } };
 * ```
 */
export type KeyOp<T> =
  | { "<": T }
  | { "<=": T }
  | { ">": T }
  | { ">=": T };

/**
 * Sort key parameter for simplified query API.
 * Uses comparison operator with value or null.
 * - Operator determines scan direction (>=, > = ascending; <=, < = descending)
 * - null = all items in that direction
 * - value = from/to that cursor
 *
 * @typeParam T - The type of the sort key value
 *
 * @example
 * ```ts
 * // All items ascending
 * const sk1: SkParam<{ orderId: string }> = { ">=": null };
 *
 * // All items descending
 * const sk2: SkParam<{ orderId: string }> = { "<=": null };
 *
 * // From specific cursor ascending
 * const sk3: SkParam<{ orderId: string }> = { ">=": { orderId: "order-003" } };
 *
 * // Up to specific cursor descending
 * const sk4: SkParam<{ orderId: string }> = { "<=": { orderId: "order-003" } };
 * ```
 */
export type SkParam<T> =
  | { "<": T | null }
  | { "<=": T | null }
  | { ">": T | null }
  | { ">=": T | null };

/**
 * Options for simple query operations.
 */
export interface SimpleQueryOptions {
  /** Maximum number of items to return */
  limit?: number;
}

/**
 * Options for subscribe operations.
 *
 * @typeParam K - The key name type ("pk" or index name)
 * @typeParam V - The value type for the cursor
 */
export interface SubscribeOptions<K, V> {
  /** The index to subscribe to ("pk" for primary or index name) */
  key: K;
  /** The cursor value to start from (items after this cursor will be returned) */
  value?: V | null;
  /** Maximum number of items to return per poll */
  limit?: number;
}

/**
 * Extracts the operator and value from a KeyOp or SkParam.
 *
 * @param op - The KeyOp/SkParam to extract from
 * @returns An object with the operator and value (value may be null for SkParam)
 */
export function extractKeyOp<T>(op: KeyOp<T> | SkParam<T>): { operator: Operator; value: T | null } {
  if ("<" in op) return { operator: "<", value: op["<"] };
  if ("<=" in op) return { operator: "<=", value: op["<="] };
  if (">" in op) return { operator: ">", value: op[">"] };
  if (">=" in op) return { operator: ">=", value: op[">="] };
  throw new Error("Invalid KeyOp: no valid operator found");
}

/**
 * Determines the ScanIndexForward value based on the operator.
 * - Forward operators (>, >=): ScanIndexForward = true (ascending)
 * - Backward operators (<, <=): ScanIndexForward = false (descending)
 *
 * @param operator - The comparison operator
 * @returns true for ascending, false for descending
 */
export function getKeyOpScanDirection(operator: Operator): boolean {
  return operator === ">" || operator === ">=";
}
