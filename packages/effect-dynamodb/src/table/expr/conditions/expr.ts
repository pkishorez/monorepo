import type { IndexDefinition } from '../../types.js';
import type { ExprResult } from '../expr-utils/index.js';
import type {
  AttributeConditionExpr,
  ConditionExpr,
  ConditionExprParameters,
  KeyConditionExprParameters,
} from './types.js';
import { extractVariant, mergeExprResults } from '../expr-utils/index.js';
import { mapVariant } from '../expr-utils/utils.js';
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
  // Extract the type from the object key
  const variant = mapVariant(condition);

  switch (variant.type) {
    // Comparison operations
    case '<':
    case '<=':
    case '>':
    case '>=':
    case '=':
      return comparisonExpr(variant.value, attr);

    // String operations
    case 'beginsWith':
    case 'contains':
      return stringExpr(variant.value, attr);

    // Range operations
    case 'between':
      return rangeExpr(variant.value, attr);

    // Existence operations
    case 'exists':
      return existenceExpr(variant.value, attr);
    case 'attrType':
      return attrTypeExpr(variant.value, attr);

    // Computed operations
    case 'size':
      return sizeExpr(variant.value, attr);

    default:
      variant satisfies never;
      throw new Error(`Unknown parameter returned: ${variant}`);
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
  const { type, value } = extractVariant(parameters) as {
    type: 'and' | 'or';
    value: ConditionExprParameters<Type>[];
  };
  const subResults = value.map((param) => expr(param));
  const expressions = subResults.map((result) => result.expr);
  const mergedAttrs = mergeExprResults(
    subResults.map((result) => ({
      ...result,
      expr: result.expr,
    })),
  );

  switch (type) {
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
    default:
      throw new Error(`Unknown logical operator: ${type}`);
  }
}

export function keyCondition<Index extends IndexDefinition>(
  index: Index,
  value: KeyConditionExprParameters<Index>,
): ExprResult {
  // Build partition key condition (always required)
  const pkCondition: AttributeConditionExpr<string> = {
    attr: index.pk,
    condition: { '=': value.pk },
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
      typeof sk === 'string' ? { '=': sk } : (sk as ConditionExpr<string>),
  };

  // Combine PK and SK conditions with AND
  return expr({
    and: [pkCondition, skCondition],
  });
}
