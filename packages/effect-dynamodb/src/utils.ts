type ConditionalOptionalFields<T> = {
  [K in keyof T]: T[K] extends infer U
    ? undefined extends T[K]
      ? U | undefined // Already optional, keep undefined
      : T[K] // Required field, keep as is
    : never;
};

// The main function that handles optional fields
export function defined<T extends Record<string, any>>(
  input: ConditionalOptionalFields<T>,
): T {
  const result = {} as T;

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      (result as any)[key] = value;
    }
  }

  return result;
}
