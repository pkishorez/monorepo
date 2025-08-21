import type { IndexDefinition } from '../../types.js';
import type { ExprResult } from '../expr-utils/index.js';
import type {
  AttributeConditionExpr,
  ConditionExpr,
  ConditionExprParameters,
  KeyConditionExprParameters,
} from './types.js';
import { mergeExprResults } from '../expr-utils/index.js';
import {
  attrTypeExpr,
  comparisonExpr,
  existenceExpr,
  rangeExpr,
  sizeExpr,
  stringExpr,
} from './expressions.js';

export function attrExpr<T>(
  condition: ConditionExpr<T>,
  attr: string,
): ExprResult {
  switch (condition.type) {
    // Comparison operations
    case '<':
    case '<=':
    case '>':
    case '>=':
    case '=':
      return comparisonExpr(condition, attr);

    // String operations
    case 'beginsWith':
    case 'contains':
      return stringExpr(condition, attr);

    // Range operations
    case 'between':
      return rangeExpr(condition, attr);

    // Existence operations
    case 'exists':
      return existenceExpr(condition, attr);
    case 'attrType':
      return attrTypeExpr(condition, attr);

    // Computed operations
    case 'size':
      return sizeExpr(condition, attr);

    default:
      condition satisfies never;
      throw new Error('Unknown parameter returned', condition);
  }
}

// Main expression builder for compound conditions
export function expr<Type>(
  parameters: ConditionExprParameters<Type>,
): ExprResult {
  // Base case: single attribute condition
  if ('attr' in parameters) {
    const result = attrExpr(parameters.condition, parameters.attr);
    return {
      ...result,
      expr: result.expr,
    };
  }

  // Recursive case: logical operations
  const subResults = parameters.value.map((param) => expr(param));
  const expressions = subResults.map((result) => result.expr);
  const mergedAttrs = mergeExprResults(
    subResults.map((result) => ({
      ...result,
      expr: result.expr,
    })),
  );

  switch (parameters.type) {
    case 'and':
      return {
        expr: `(${expressions.join(' AND ')})`,
        exprAttributes: mergedAttrs.exprAttributes,
        exprValues: mergedAttrs.exprValues,
      };
    case 'or':
      return {
        expr: `(${expressions.join(' OR ')})`,
        exprAttributes: mergedAttrs.exprAttributes,
        exprValues: mergedAttrs.exprValues,
      };
  }
}

export function keyCondition<Index extends IndexDefinition>(
  index: Index,
  value: KeyConditionExprParameters<Index>,
): ExprResult {
  // Build partition key condition (always required)
  const pkCondition: AttributeConditionExpr<string> = {
    attr: index.pk,
    condition: { type: '=', value: value.pk },
  };

  // Handle case with no sort key
  if (!('sk' in value && 'sk' in index && value.sk)) {
    return expr(pkCondition);
  }

  const { sk } = value;

  // Build sort key condition
  const skCondition: AttributeConditionExpr<string> = {
    attr: index.sk,
    condition:
      typeof sk === 'string'
        ? { type: '=', value: sk }
        : (sk as ConditionExpr<string>),
  };

  // Combine PK and SK conditions with AND
  return expr({
    type: 'and',
    value: [pkCondition, skCondition],
  });
}
