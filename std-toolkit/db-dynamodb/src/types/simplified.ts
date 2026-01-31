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
 * - value = from/to that cursor (just the string value, not an object)
 *
 * @example
 * ```ts
 * // All items ascending
 * const sk1: SkParam = { ">=": null };
 *
 * // All items descending
 * const sk2: SkParam = { "<=": null };
 *
 * // From specific cursor ascending (just the value!)
 * const sk3: SkParam = { ">=": "order-003" };
 *
 * // Up to specific cursor descending
 * const sk4: SkParam = { "<=": "order-003" };
 * ```
 */
export type SkParam =
  | { "<": string | null }
  | { "<=": string | null }
  | { ">": string | null }
  | { ">=": string | null };

/**
 * Sort key parameter for streaming queries.
 * Only supports exclusive operators (> and <) for cursor-based pagination.
 * - `>`: Ascending order (oldest to newest)
 * - `<`: Descending order (newest to oldest)
 */
export type StreamSkParam = { ">": string | null } | { "<": string | null };

/**
 * Options for simple query operations.
 */
export interface SimpleQueryOptions {
  /** Maximum number of items to return */
  limit?: number;
}

/**
 * Options for query stream operations.
 */
export interface QueryStreamOptions {
  /** Number of items to fetch per batch (default: 100) */
  batchSize?: number;
}

/**
 * Options for subscribe operations.
 *
 * @typeParam K - The key name type ("primary", "timeline", or index name)
 * @typeParam PK - The partition key value type for the selected index
 */
export interface SubscribeOptions<K, PK> {
  /** The index to subscribe to ("primary", "timeline", or index name) */
  key: K;
  /** The partition key value for the selected index */
  pk: PK;
  /** The cursor (_uid) to start from. null = start from beginning, string = continue from that point */
  cursor: string | null;
  /** Maximum number of items to return per query batch */
  limit?: number;
}

/**
 * Extracts the operator and value from a KeyOp or SkParam.
 *
 * @param op - The KeyOp/SkParam to extract from
 * @returns An object with the operator and value (value may be null for SkParam)
 */
export function extractKeyOp<T>(op: KeyOp<T> | SkParam): { operator: Operator; value: T | string | null } {
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
