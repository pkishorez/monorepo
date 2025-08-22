import type { IndexDefinition } from '../../types.js';
import type { ExprResult } from '../expr-utils/index.js';
import type { AttrValueType, StringAttr } from '../expr-utils/types.js';
import type {
  AttributeConditionExpr,
  ConditionExpr,
  ExprInput,
  KeyConditionExprParameters,
  SimpleConditionExpr,
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

export function attrExpr<T, Attr extends StringAttr<T> = StringAttr<T>>(
  attr: Attr,
  condition: ConditionExpr<AttrValueType<T, Attr>>,
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

// Helper function to check if input is already an ExprResult
function isExprResult(input: any): input is ExprResult {
  return input && typeof input === 'object' && 'expr' in input;
}

// Helper function to normalize any input to ExprResult
function normalizeToExprResult(input: ExprInput<any>): ExprResult {
  // If already an ExprResult, return as-is
  if (isExprResult(input)) {
    return input;
  }

  // Otherwise it's a SimpleConditionExpr - convert each attribute
  const entries = Object.entries(input as SimpleConditionExpr<any>);

  if (entries.length === 0) {
    return { expr: '', exprAttributes: {}, exprValues: {} };
  }

  if (entries.length === 1) {
    // Single condition - return directly
    const [attr, condition] = entries[0];
    return attrExpr(attr, condition as ConditionExpr<any>);
  }

  // Multiple conditions - combine with AND
  const subResults = entries.map(([attr, condition]) =>
    attrExpr(attr, condition as ConditionExpr<any>),
  );

  return {
    expr: subResults.map((r) => `(${r.expr})`).join(' AND '),
    ...mergeExprResults(subResults),
  };
}

// Combine multiple expressions with a logical operator
function combineExpressions(
  conditions: ExprResult[],
  operator: ' AND ' | ' OR ',
): ExprResult {
  if (conditions.length === 0) {
    return { expr: '', exprAttributes: {}, exprValues: {} };
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  // Wrap each expression in parentheses if it contains the opposite operator
  const oppositeOp = operator === ' AND ' ? ' OR ' : ' AND ';
  const expressions = conditions.map((c) => {
    if (c.expr.includes(oppositeOp) && !c.expr.startsWith('(')) {
      return `(${c.expr})`;
    }
    return c.expr;
  });

  return {
    expr: expressions.join(operator),
    ...mergeExprResults(conditions),
  };
}

export function and(...conditions: ExprInput<any>[]): ExprResult {
  const normalized = conditions.map((c) => normalizeToExprResult(c));
  return combineExpressions(normalized, ' AND ');
}

export function or(...conditions: ExprInput<any>[]): ExprResult {
  const normalized = conditions.map((c) => normalizeToExprResult(c));
  return combineExpressions(normalized, ' OR ');
}

export function not(condition: ExprInput<any>): ExprResult {
  const normalized = normalizeToExprResult(condition);

  // Wrap in parentheses if the expression contains AND/OR
  const needsParens =
    normalized.expr.includes(' AND ') || normalized.expr.includes(' OR ');
  const expr = needsParens
    ? `NOT (${normalized.expr})`
    : `NOT ${normalized.expr}`;

  return {
    expr,
    exprAttributes: normalized.exprAttributes,
    exprValues: normalized.exprValues,
  };
}

// Main expression builder for simple conditions
export function expr(condition: ExprInput<any>): ExprResult {
  return normalizeToExprResult(condition);
}

export function keyCondition<Index extends IndexDefinition>(
  index: Index,
  value: KeyConditionExprParameters<Index>,
): ExprResult {
  // Build partition key condition (always required)
  const pkCondition: SimpleConditionExpr<any> = {
    [index.pk]: { '=': value.pk },
  };

  // Handle case with no sort key
  if (!('sk' in value && 'sk' in index && value.sk)) {
    return expr(pkCondition);
  }

  const { sk } = value;

  // Build sort key condition
  const skCondition: SimpleConditionExpr<any> = {
    [index.sk]:
      typeof sk === 'string' ? { '=': sk } : (sk as ConditionExpr<string>),
  };

  // Combine PK and SK conditions with AND
  return and(pkCondition, skCondition);
}
