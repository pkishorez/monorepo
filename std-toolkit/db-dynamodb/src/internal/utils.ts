/**
 * Extracts all possible keys from a union type.
 */
type UnionKeys<T> = T extends T ? keyof T : never;

/**
 * Converts a record with a single key-value pair to a discriminated union object.
 * Useful for normalizing DynamoDB AttributeValue format into a tagged union.
 *
 * @typeParam T - The record type with a single key
 * @typeParam K - The union of all possible keys in T
 * @param obj - A record with exactly one key-value pair
 * @returns An object with `type` as the key name and `value` as the value
 *
 * @example
 * ```ts
 * const attr = { S: "hello" };
 * const result = toDiscriminatedGeneric(attr);
 * // { type: "S", value: "hello" }
 * ```
 */
export function toDiscriminatedGeneric<
  T extends Record<string, any>,
  K extends UnionKeys<T> = UnionKeys<T>,
>(obj: T): { type: K; value: T[K] } {
  const key = Object.keys(obj)[0] as K;
  return { type: key, value: obj[key] };
}

/**
 * Converts a discriminated union object back to a record with a single key-value pair.
 * The inverse of toDiscriminatedGeneric.
 *
 * @typeParam K - The key type (string literal)
 * @typeParam V - The value type
 * @param discriminated - An object with `type` and `value` properties
 * @returns A record with the type as key and value as value
 *
 * @example
 * ```ts
 * const disc = { type: "S" as const, value: "hello" };
 * const result = fromDiscriminatedGeneric(disc);
 * // { S: "hello" }
 * ```
 */
export function fromDiscriminatedGeneric<K extends string, V>(discriminated: {
  type: K;
  value: V;
}): Record<K, V> {
  return { [discriminated.type]: discriminated.value } as Record<K, V>;
}
