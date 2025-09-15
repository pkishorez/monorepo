import type { ExprResult } from '../types.js';
import type { UpdateExprParameters } from './types.js';
import { AttributeMapBuilder } from '../utils.js';

// Main update expression builder
export function updateExpr<
  T extends Record<string, unknown> = Record<string, unknown>,
>(parameters: UpdateExprParameters<T>): ExprResult {
  const attrBuilder = new AttributeMapBuilder('update_');

  const setExprs: string[] = [];
  Object.entries(parameters).forEach(([key, value]) => {
    const { attrKey, attrValue } = attrBuilder.setAttr(key, value);

    setExprs.push(`${attrKey}=${attrValue}`);
  });

  return {
    expr: `SET ${setExprs.join(', ')}`,
    ...attrBuilder.build(),
  };
}
