import type {
  AttrExprResult,
  AttrTypeExpr,
  ComparisonExpr,
  ExistenceExpr,
  RangeExpr,
  SizeExpr,
  StringExpr,
} from './types.js';
import { generateAttributeNames, generateUniqueId } from './utils.js';

// Comparison expression builder for numeric and string comparisons
export function buildComparisonExpr<T>(
  condition: ComparisonExpr<T>,
  attr: string,
  direct: boolean = false,
): AttrExprResult {
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
    exprAttributes: generateAttributeNames(attrName, attr),
    exprValues: { [valueName]: condition.value },
  };
}

// String operation expression builder
export function buildStringExpr<T extends string>(
  condition: StringExpr<T>,
  attr: string,
): AttrExprResult {
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
    exprAttributes: generateAttributeNames(attrName, attr),
    exprValues: { [valueName]: condition.value },
  };
}

// Range expression builder for BETWEEN operations
export function buildRangeExpr<T>(
  condition: RangeExpr<T>,
  attr: string,
): AttrExprResult {
  const id = generateUniqueId();
  const attrName = `#attr${id}`;
  const valueName = `:value${id}`;
  const valueName2 = `:value${id}_end`;

  return {
    expr: `${attrName} BETWEEN ${valueName} AND ${valueName2}`,
    exprAttributes: generateAttributeNames(attrName, attr),
    exprValues: {
      [valueName]: condition.value[0],
      [valueName2]: condition.value[1],
    },
  };
}

// Existence expression builder
export function buildExistenceExpr(
  condition: ExistenceExpr,
  attr: string,
): AttrExprResult {
  const id = generateUniqueId();
  const attrName = `#attr${id}`;

  return {
    expr: condition.value
      ? `attribute_exists(${attrName})`
      : `attribute_not_exists(${attrName})`,
    exprAttributes: generateAttributeNames(attrName, attr),
    exprValues: {},
  };
}

// Attribute type expression builder
export function buildAttrTypeExpr(
  condition: AttrTypeExpr,
  attr: string,
): AttrExprResult {
  const id = generateUniqueId();
  const attrName = `#attr${id}`;
  const valueName = `:value${id}`;

  return {
    expr: `attribute_type(${attrName}, ${valueName})`,
    exprAttributes: generateAttributeNames(attrName, attr),
    exprValues: { [valueName]: condition.value },
  };
}

// Size expression builder (recursive for nested conditions)
export function buildSizeExpr(
  condition: SizeExpr,
  attr: string,
): AttrExprResult {
  const outerAttrId = generateUniqueId();
  const outerAttrName = `#attr${outerAttrId}`;
  const sizeExpr = `size(${outerAttrName})`;

  // Build the nested condition with direct injection of size expression
  const nestedResult = buildComparisonExpr(condition.value, sizeExpr, true);

  return {
    expr: nestedResult.expr,
    exprAttributes: generateAttributeNames(outerAttrName, attr),
    exprValues: nestedResult.exprValues,
  };
}

