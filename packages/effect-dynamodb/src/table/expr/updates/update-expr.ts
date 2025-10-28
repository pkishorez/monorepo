import type { ExprResult } from '../types.js';
import type { UpdateExprParameters } from './types.js';
import { AttributeMapBuilder } from '../utils.js';

// Main update expression builder
export function updateExpr<
  T extends Record<string, unknown> = Record<string, unknown>,
>(parameters: UpdateExprParameters<T>): ExprResult {
  const attrBuilder = new AttributeMapBuilder('update_');

  const setExprs = Object.entries(parameters.set).map(([key, value]) => {
    const { attrKey, attrValue } = attrBuilder.setAttr(key, value);
    return `${attrKey}=${attrValue}`;
  });
  const setExpr = setExprs.join(', ');

  return {
    expr: `SET ${setExpr}`,
    ...attrBuilder.build(),
  };
}
