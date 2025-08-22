import type { ExprResult } from '../expr-utils/index.js';
import type {
  AttrTypeExpr,
  ComparisonExpr,
  ExistenceExpr,
  RangeExpr,
  SizeExpr,
  StringExpr,
} from './types.js';
import { extractVariant, generateUniqueId } from '../expr-utils/index.js';

// Comparison expression for numeric and string comparisons
export function comparisonExpr<T>(
  condition: ComparisonExpr<T>,
  attr: string,
  direct: boolean = false,
): ExprResult {
  const { type, value } = extractVariant(condition);
  const id = generateUniqueId();
  const valueName = `:value${id}`;

  if (direct) {
    // Use attr directly as the expression (e.g., "size(#attr1)")
    return {
      expr: `${attr} ${type} ${valueName}`,
      exprAttributes: {},
      exprValues: { [valueName]: value },
    };
  }

  // Normal case: generate attribute name mapping
  const attrName = `#attr${id}`;
  return {
    expr: `${attrName} ${type} ${valueName}`,
    exprAttributes: { [attrName]: attr },
    exprValues: { [valueName]: value },
  };
}

// String operation expression
export function stringExpr<T>(
  condition: StringExpr<T>,
  attr: string,
): ExprResult {
  const { type, value } = extractVariant(condition);
  const id = generateUniqueId();
  const attrName = `#attr${id}`;
  const valueName = `:value${id}`;

  const functionMap = {
    beginsWith: 'begins_with',
    contains: 'contains',
  } as const;

  const functionName = functionMap[type];

  return {
    expr: `${functionName}(${attrName}, ${valueName})`,
    exprAttributes: { [attrName]: attr },
    exprValues: { [valueName]: value },
  };
}

// Range expression for BETWEEN operations
export function rangeExpr<T>(
  condition: RangeExpr<T>,
  attr: string,
): ExprResult {
  const { value } = extractVariant(condition);
  const id = generateUniqueId();
  const attrName = `#attr${id}`;
  const valueName = `:value${id}`;
  const valueName2 = `:value${id}_end`;

  return {
    expr: `${attrName} BETWEEN ${valueName} AND ${valueName2}`,
    exprAttributes: { [attrName]: attr },
    exprValues: {
      [valueName]: value[0],
      [valueName2]: value[1],
    },
  };
}

// Existence expression
export function existenceExpr(
  condition: ExistenceExpr,
  attr: string,
): ExprResult {
  const { value } = extractVariant(condition);
  const id = generateUniqueId();
  const attrName = `#attr${id}`;

  return {
    expr: value
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
  const { value } = extractVariant(condition);
  const id = generateUniqueId();
  const attrName = `#attr${id}`;
  const valueName = `:value${id}`;

  return {
    expr: `attribute_type(${attrName}, ${valueName})`,
    exprAttributes: { [attrName]: attr },
    exprValues: { [valueName]: value },
  };
}

// Size expression (recursive for nested conditions)
export function sizeExpr(condition: SizeExpr, attr: string): ExprResult {
  const { value } = extractVariant(condition);
  const outerAttrId = generateUniqueId();
  const outerAttrName = `#attr${outerAttrId}`;
  const sizeExprStr = `size(${outerAttrName})`;

  // Build the nested condition with direct injection of size expression
  const nestedResult = comparisonExpr(value, sizeExprStr, true);

  return {
    expr: nestedResult.expr,
    exprAttributes: { [outerAttrName]: attr },
    exprValues: nestedResult.exprValues,
  };
}
