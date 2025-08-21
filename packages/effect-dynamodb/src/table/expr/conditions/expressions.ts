import type { ExprResult } from '../expr-utils/index.js';
import type {
  AttrTypeExpr,
  ComparisonExpr,
  ExistenceExpr,
  RangeExpr,
  SizeExpr,
  StringExpr,
} from './types.js';
import { generateUniqueId } from '../expr-utils/index.js';

// Comparison expression for numeric and string comparisons
export function comparisonExpr<T>(
  condition: ComparisonExpr<T>,
  attr: string,
  direct: boolean = false,
): ExprResult {
  const id = generateUniqueId();
  const valueName = `:value${id}`;

  if (direct) {
    // Use attr directly as the expression (e.g., "size(#attr1)")
    return {
      expr: `${attr} ${condition.type} ${valueName}`,
      exprAttributes: {},
      exprValues: { [valueName]: condition.value },
    };
  }

  // Normal case: generate attribute name mapping
  const attrName = `#attr${id}`;
  return {
    expr: `${attrName} ${condition.type} ${valueName}`,
    exprAttributes: { [attrName]: attr },
    exprValues: { [valueName]: condition.value },
  };
}

// String operation expression
export function stringExpr<T extends string>(
  condition: StringExpr<T>,
  attr: string,
): ExprResult {
  const id = generateUniqueId();
  const attrName = `#attr${id}`;
  const valueName = `:value${id}`;

  const functionMap = {
    beginsWith: 'begins_with',
    contains: 'contains',
  } as const;

  const functionName = functionMap[condition.type];

  return {
    expr: `${functionName}(${attrName}, ${valueName})`,
    exprAttributes: { [attrName]: attr },
    exprValues: { [valueName]: condition.value },
  };
}

// Range expression for BETWEEN operations
export function rangeExpr<T>(
  condition: RangeExpr<T>,
  attr: string,
): ExprResult {
  const id = generateUniqueId();
  const attrName = `#attr${id}`;
  const valueName = `:value${id}`;
  const valueName2 = `:value${id}_end`;

  return {
    expr: `${attrName} BETWEEN ${valueName} AND ${valueName2}`,
    exprAttributes: { [attrName]: attr },
    exprValues: {
      [valueName]: condition.value[0],
      [valueName2]: condition.value[1],
    },
  };
}

// Existence expression
export function existenceExpr(
  condition: ExistenceExpr,
  attr: string,
): ExprResult {
  const id = generateUniqueId();
  const attrName = `#attr${id}`;

  return {
    expr: condition.value
      ? `attribute_exists(${attrName})`
      : `attribute_not_exists(${attrName})`,
    exprAttributes: { [attrName]: attr },
    exprValues: {},
  };
}

// Attribute type expression
export function attrTypeExpr(
  condition: AttrTypeExpr,
  attr: string,
): ExprResult {
  const id = generateUniqueId();
  const attrName = `#attr${id}`;
  const valueName = `:value${id}`;

  return {
    expr: `attribute_type(${attrName}, ${valueName})`,
    exprAttributes: { [attrName]: attr },
    exprValues: { [valueName]: condition.value },
  };
}

// Size expression (recursive for nested conditions)
export function sizeExpr(condition: SizeExpr, attr: string): ExprResult {
  const outerAttrId = generateUniqueId();
  const outerAttrName = `#attr${outerAttrId}`;
  const sizeExpr = `size(${outerAttrName})`;

  // Build the nested condition with direct injection of size expression
  const nestedResult = comparisonExpr(condition.value, sizeExpr, true);

  return {
    expr: nestedResult.expr,
    exprAttributes: { [outerAttrName]: attr },
    exprValues: nestedResult.exprValues,
  };
}

