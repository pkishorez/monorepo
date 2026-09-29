/**
 * `value` when it is one of `allowed`, else `fallback`. Search params arrive
 * as strings, numbers or booleans, so they compare by their text.
 */
export const oneOf = <const T extends string | number | boolean>(
  value: unknown,
  allowed: ReadonlyArray<T>,
  fallback: T,
): T => allowed.find((a) => String(a) === String(value)) ?? fallback;
