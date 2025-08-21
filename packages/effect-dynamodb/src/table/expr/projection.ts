import type { ExprResult } from './expr-utils/types.js';

export function projectionExpr(attrs: string[]): ExprResult {
  const exprAttributes: ExprResult['exprAttributes'] = {};

  const condition = attrs
    .map((v, i) => {
      exprAttributes[`#pattr${i}`] = v;
      return `#pattr${i}`;
    })
    .join(', ');

  return { expr: condition, exprAttributes, exprValues: {} };
}
