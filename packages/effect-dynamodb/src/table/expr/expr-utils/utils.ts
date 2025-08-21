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

