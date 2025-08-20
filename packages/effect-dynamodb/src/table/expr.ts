import type { CompoundIndexDefinition, IndexDefinition } from "./types.js";

// Granular expression types
export type ComparisonExpr<T> =
  | { type: "lt"; value: T }
  | { type: "lte"; value: T }
  | { type: "gt"; value: T }
  | { type: "gte"; value: T }
  | { type: "eq"; value: T };

export type StringExpr<T extends string = string> =
  | { type: "beginsWith"; value: T }
  | { type: "contains"; value: T };

export interface RangeExpr<T> {
  type: "between";
  value: [T, T];
}

export interface ExistenceExpr {
  type: "exists";
  value: boolean;
}

export interface AttrTypeExpr {
  type: "attrType";
  value: string;
}

export interface SizeExpr {
  type: "size";
  value: ComparisonExpr<number>;
}

// Key condition specific string operations (only beginsWith is supported in key conditions)
export interface KeyStringExpr<T extends string = string> {
  type: "beginsWith";
  value: T;
}

// Composite types
export type KeyConditionExpr<T> =
  | ComparisonExpr<T>
  | KeyStringExpr<T extends string ? T : never>
  | RangeExpr<T>;

export type KeyConditionExprParameters<Index extends IndexDefinition> =
  Index extends CompoundIndexDefinition
    ? { pk: string; sk?: string | KeyConditionExpr<string> }
    : { pk: string };

export type ConditionExpr<T> =
  | ComparisonExpr<T>
  | StringExpr<T extends string ? T : never>
  | RangeExpr<T>
  | ExistenceExpr
  | AttrTypeExpr
  | SizeExpr;
// Base condition with attribute mapping
export interface AttributeCondition<T> {
  attr: string;
  condition: ConditionExpr<T>;
}

// Compound expression parameters including logical operations
export type ConditionExprParameters<Type> =
  | AttributeCondition<Type>
  | { type: "and"; value: ConditionExprParameters<Type>[] }
  | { type: "or"; value: ConditionExprParameters<Type>[] };

export function keyCondition<Index extends IndexDefinition>(
  index: Index,
  value: KeyConditionExprParameters<Index>,
): CompoundExprResult {
  // Build partition key condition (always required)
  const pkCondition: AttributeCondition<string> = {
    attr: index.pk,
    condition: { type: "eq", value: value.pk },
  };

  // Handle case with no sort key
  if (!("sk" in value) || !("sk" in index) || !value.sk) {
    return expr(pkCondition);
  }

  const { sk } = value;

  // Build sort key condition
  const skCondition: AttributeCondition<string> = {
    attr: index.sk,
    condition:
      typeof sk === "string"
        ? { type: "eq", value: sk }
        : (sk as ConditionExpr<string>),
  };

  // Combine PK and SK conditions with AND
  return expr({
    type: "and",
    value: [pkCondition, skCondition],
  });
}

let uid = 0;

interface AttrExprResult {
  expr: string;
  exprAttributeName: Record<string, string>;
  exprAttributeValue: Record<string, unknown>;
}

// Result type for compound expressions
interface CompoundExprResult {
  condition: string;
  exprAttributes: Record<string, string>;
  exprValues: Record<string, unknown>;
}

// Helper to generate unique attribute names
function generateAttributeNames(attr: string): Record<string, string> {
  return { [`#attr${uid++}`]: attr };
}

// Comparison expression builder for numeric and string comparisons
function buildComparisonExpr<T>(
  condition: ComparisonExpr<T>,
  attr: string,
  direct: boolean = false,
): AttrExprResult {
  const id = uid++;
  const valueName = `:value${id}`;

  const operatorMap = {
    lt: "<",
    lte: "<=",
    gt: ">",
    gte: ">=",
    eq: "=",
  } as const;

  const operator = operatorMap[condition.type];

  if (direct) {
    // Use attr directly as the expression (e.g., "size(#attr1)")
    return {
      expr: `${attr} ${operator} ${valueName}`,
      exprAttributeName: {},
      exprAttributeValue: { [valueName]: condition.value },
    };
  }

  // Normal case: generate attribute name mapping
  const attrName = `#attr${id}`;
  return {
    expr: `${attrName} ${operator} ${valueName}`,
    exprAttributeName: generateAttributeNames(attr),
    exprAttributeValue: { [valueName]: condition.value },
  };
}

// String operation expression builder
function buildStringExpr<T extends string>(
  condition: StringExpr<T>,
  attr: string,
): AttrExprResult {
  const id = uid++;
  const attrName = `#attr${id}`;
  const valueName = `:value${id}`;

  const functionMap = {
    beginsWith: "begins_with",
    contains: "contains",
  } as const;

  const functionName = functionMap[condition.type];

  return {
    expr: `${functionName}(${attrName}, ${valueName})`,
    exprAttributeName: generateAttributeNames(attr),
    exprAttributeValue: { [valueName]: condition.value },
  };
}

// Range expression builder for BETWEEN operations
function buildRangeExpr<T>(
  condition: RangeExpr<T>,
  attr: string,
): AttrExprResult {
  const id = uid++;
  const attrName = `#attr${id}`;
  const valueName = `:value${id}`;
  const valueName2 = `:value${id}_end`;

  return {
    expr: `${attrName} BETWEEN ${valueName} AND ${valueName2}`,
    exprAttributeName: generateAttributeNames(attr),
    exprAttributeValue: {
      [valueName]: condition.value[0],
      [valueName2]: condition.value[1],
    },
  };
}

// Existence expression builder
function buildExistenceExpr(
  condition: ExistenceExpr,
  attr: string,
): AttrExprResult {
  const id = uid++;
  const attrName = `#attr${id}`;

  return {
    expr: condition.value
      ? `attribute_exists(${attrName})`
      : `attribute_not_exists(${attrName})`,
    exprAttributeName: generateAttributeNames(attr),
    exprAttributeValue: {},
  };
}

// Attribute type expression builder
function buildAttrTypeExpr(
  condition: AttrTypeExpr,
  attr: string,
): AttrExprResult {
  const id = uid++;
  const attrName = `#attr${id}`;
  const valueName = `:value${id}`;

  return {
    expr: `attribute_type(${attrName}, ${valueName})`,
    exprAttributeName: generateAttributeNames(attr),
    exprAttributeValue: { [valueName]: condition.value },
  };
}

// Size expression builder (recursive for nested conditions)
function buildSizeExpr(condition: SizeExpr, attr: string): AttrExprResult {
  const outerAttrId = uid++;
  const outerAttrName = `#attr${outerAttrId}`;
  const sizeExpr = `size(${outerAttrName})`;

  // Build the nested condition with direct injection of size expression
  const nestedResult = buildComparisonExpr(condition.value, sizeExpr, true);

  return {
    expr: nestedResult.expr,
    exprAttributeName: generateAttributeNames(attr),
    exprAttributeValue: nestedResult.exprAttributeValue,
  };
}

export function attrExpr<T>(
  condition: ConditionExpr<T>,
  attr: string,
): AttrExprResult {
  switch (condition.type) {
    // Comparison operations
    case "lt":
    case "lte":
    case "gt":
    case "gte":
    case "eq":
      return buildComparisonExpr(condition, attr);

    // String operations
    case "beginsWith":
    case "contains":
      return buildStringExpr(condition, attr);

    // Range operations
    case "between":
      return buildRangeExpr(condition, attr);

    // Existence operations
    case "exists":
      return buildExistenceExpr(condition, attr);
    case "attrType":
      return buildAttrTypeExpr(condition, attr);

    // Computed operations
    case "size":
      return buildSizeExpr(condition, attr);
  }
}

// Helper to merge expression results
function mergeExprResults(results: AttrExprResult[]): {
  exprAttributes: Record<string, string>;
  exprValues: Record<string, unknown>;
} {
  return results.reduce(
    (acc, result) => ({
      exprAttributes: { ...acc.exprAttributes, ...result.exprAttributeName },
      exprValues: { ...acc.exprValues, ...result.exprAttributeValue },
    }),
    { exprAttributes: {}, exprValues: {} },
  );
}

// Main expression builder for compound conditions
export function expr<Type>(
  parameters: ConditionExprParameters<Type>,
): CompoundExprResult {
  // Base case: single attribute condition
  if ("attr" in parameters) {
    const result = attrExpr(parameters.condition, parameters.attr);
    return {
      condition: result.expr,
      exprAttributes: result.exprAttributeName,
      exprValues: result.exprAttributeValue,
    };
  }

  // Recursive case: logical operations
  const subResults = parameters.value.map((param) => expr(param));
  const expressions = subResults.map((result) => result.condition);
  const mergedAttrs = mergeExprResults(
    subResults.map((result) => ({
      expr: result.condition,
      exprAttributeName: result.exprAttributes,
      exprAttributeValue: result.exprValues,
    })),
  );

  switch (parameters.type) {
    case "and":
      return {
        condition: `(${expressions.join(" AND ")})`,
        exprAttributes: mergedAttrs.exprAttributes,
        exprValues: mergedAttrs.exprValues,
      };
    case "or":
      return {
        condition: `(${expressions.join(" OR ")})`,
        exprAttributes: mergedAttrs.exprAttributes,
        exprValues: mergedAttrs.exprValues,
      };
  }
}
