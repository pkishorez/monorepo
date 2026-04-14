/**
 * Conditionally include properties in a spread expression.
 *
 * @example
 * ```ts
 * const opts = {
 *   name: "foo",
 *   ...when(count > 0, { maxCount: count }),
 *   ...when(verbose, { debug: true }),
 * };
 * ```
 */
export const when = <T extends Record<string, unknown>>(
  condition: boolean,
  properties: T,
): T | {} => (condition ? properties : {});
