import type { ExprResult } from '../types.js';
import type { ConditionExprParameters } from './types.js';
import { AttributeMapBuilder } from '../utils.js';

// Main update expression builder
export function conditionExpr<
  TItem extends Record<string, unknown> = Record<string, unknown>,
>(parameters: ConditionExprParameters<TItem>): ExprResult {
  const attrBuilder = new AttributeMapBuilder('cond_');

  const expr: string[] = [];
  Object.entries(parameters).forEach(([key, value]) => {
    const { attrKey, attrValue } = attrBuilder.setAttr(key, value);

    expr.push(`${attrKey}=${attrValue}`);
  });

  return {
    expr: expr.join(' AND '),
    ...attrBuilder.build(),
  };
}
