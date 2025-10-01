export type UnionKeys<T> = T extends any ? keyof T : never;

// Utility type to remove readonly modifiers
type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

// Generic function to convert readonly array to mutable array
export function toMutable<T>(readonlyArray: readonly T[]) {
  // Deep clone to ensure we're not mutating the original
  return structuredClone(readonlyArray) as Mutable<T>[];
}
