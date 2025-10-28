import { ExprResult } from '../types.js';

export const and = (...exprs: (ExprResult | null | undefined)[]) => {
  const cleaned = exprs.filter(
    (v): v is ExprResult => v !== null || v !== undefined,
  );
  if (cleaned.length === 1) {
    return cleaned;
  }
};
