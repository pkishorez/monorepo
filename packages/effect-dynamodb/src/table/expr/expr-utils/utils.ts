import type { ExprResult } from './types.js';

let uid = 0;

// Helper to generate unique IDs for attributes and values
export function generateUniqueId(): number {
  return uid++;
}

// Helper to merge expression results
export function mergeExprResults(results: ExprResult[]): {
  exprAttributes: Record<string, string>;
  exprValues: Record<string, unknown>;
} {
  return results.reduce(
    (acc, result) => ({
      exprAttributes: { ...acc.exprAttributes, ...result.exprAttributes },
      exprValues: { ...acc.exprValues, ...result.exprValues },
    }),
    { exprAttributes: {}, exprValues: {} },
  );
}

// Fixed: Use distributive conditional type
type Transform<T> =
  T extends Record<PropertyKey, any>
    ? { [K in keyof T]: { type: K; value: T[K] } }[keyof T]
    : never;

export function extractVariant<T extends Record<PropertyKey, any>>(
  obj: T,
): Transform<T> {
  const [key, value] = Object.entries(obj)[0];
  return { type: key as keyof T, value } as Transform<T>;
}

// New: MapVariant type that preserves the original object structure
type MapVariant<T> =
  T extends Record<PropertyKey, any>
    ? { [K in keyof T]: { type: K; value: T } }[keyof T]
    : never;
export function mapVariant<T extends Record<PropertyKey, any>>(
  obj: T,
): MapVariant<T> {
  const key = Object.keys(obj)[0] as keyof T;
  return { type: key, value: obj } as MapVariant<T>;
}
