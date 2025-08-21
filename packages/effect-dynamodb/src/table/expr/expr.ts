import type { IndexDefinition } from '../types.js';
import type {
  AttrExprResult,
  AttributeConditionExpr,
  CompoundExprResult,
  ConditionExpr,
  ConditionExprParameters,
  KeyConditionExprParameters,
} from './types.js';
import {
  buildAttrTypeExpr,
  buildComparisonExpr,
  buildExistenceExpr,
  buildRangeExpr,
  buildSizeExpr,
  buildStringExpr,
} from './builders.js';
import { mergeExprResults } from './utils.js';

export function attrExpr<T>(
  condition: ConditionExpr<T>,
  attr: string,
): AttrExprResult {
  switch (condition.type) {
    // Comparison operations
    case '<':
    case '<=':
    case '>':
    case '>=':
    case '=':
      return buildComparisonExpr(condition, attr);

    // String operations
    case 'beginsWith':
    case 'contains':
      return buildStringExpr(condition, attr);

    // Range operations
    case 'between':
      return buildRangeExpr(condition, attr);

    // Existence operations
    case 'exists':
      return buildExistenceExpr(condition, attr);
    case 'attrType':
      return buildAttrTypeExpr(condition, attr);

    // Computed operations
    case 'size':
      return buildSizeExpr(condition, attr);
  }
}

// Main expression builder for compound conditions
export function expr<Type>(
  parameters: ConditionExprParameters<Type>,
): CompoundExprResult {
  // Base case: single attribute condition
  if ('attr' in parameters) {
    const result = attrExpr(parameters.condition, parameters.attr);
    return {
      ...result,
      condition: result.expr,
    };
  }

  // Recursive case: logical operations
  const subResults = parameters.value.map((param) => expr(param));
  const expressions = subResults.map((result) => result.condition);
  const mergedAttrs = mergeExprResults(
    subResults.map((result) => ({
      ...result,
      expr: result.condition,
    })),
  );

  switch (parameters.type) {
    case 'and':
      return {
        condition: `(${expressions.join(' AND ')})`,
        exprAttributes: mergedAttrs.exprAttributes,
        exprValues: mergedAttrs.exprValues,
      };
    case 'or':
      return {
        condition: `(${expressions.join(' OR ')})`,
        exprAttributes: mergedAttrs.exprAttributes,
        exprValues: mergedAttrs.exprValues,
      };
  }
}

export function keyCondition<Index extends IndexDefinition>(
  index: Index,
  value: KeyConditionExprParameters<Index>,
): CompoundExprResult {
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
