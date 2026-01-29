type UnionKeys<T> = T extends T ? keyof T : never;

/**
 * Converts a record with a single key-value pair to a discriminated union object.
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
 */
export function fromDiscriminatedGeneric<K extends string, V>(discriminated: {
  type: K;
  value: V;
}): Record<K, V> {
  return { [discriminated.type]: discriminated.value } as Record<K, V>;
}
