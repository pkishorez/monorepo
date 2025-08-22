import type { ExprResult } from './expr-utils/types.js';

export function projectionExpr(attrs: string[]): ExprResult {
  const exprAttributes: ExprResult['exprAttributes'] = {};

  const condition = attrs
    .map((v, i) => {
      const attrKey = `#proj_attr${i + 1}`;
      exprAttributes[attrKey] = v;
      return attrKey;
    })
    .join(', ');

  return { expr: condition, exprAttributes, exprValues: {} };
}
