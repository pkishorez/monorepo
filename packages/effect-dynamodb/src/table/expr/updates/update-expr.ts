import type { ExprResult } from '../expr-utils/index.js';
import type {
  SetValueExpr,
  UpdateExprParameters,
  UpdateExprResult,
} from './types.js';
import { generateUniqueId, mergeExprResults } from '../expr-utils/index.js';

// Helper to handle SET value expressions (functions or direct values)
function buildSetValue<T>(value: SetValueExpr<T>): ExprResult {
  // Function expression cases
  const id = generateUniqueId();
  const valueName = `:value${id}`;

  switch (value.op) {
    case 'direct': {
      return {
        expr: valueName,
        exprAttributes: {},
        exprValues: { [valueName]: value.value },
      };
    }

    case 'list_append': {
      const attrId = generateUniqueId();
      const attrName = `#attr${attrId}`;
      return {
        expr: `list_append(${attrName}, ${valueName})`,
        exprAttributes: { [attrName]: value.attr },
        exprValues: { [valueName]: value.list },
      };
    }

    case 'if_not_exists': {
      const attrId = generateUniqueId();
      const attrName = `#attr${attrId}`;
      return {
        expr: `if_not_exists(${attrName}, ${valueName})`,
        exprAttributes: { [attrName]: value.attr },
        exprValues: { [valueName]: value.default },
      };
    }

    case 'plus': {
      const attrId = generateUniqueId();
      const attrName = `#attr${attrId}`;
      return {
        expr: `${attrName} + ${valueName}`,
        exprAttributes: { [attrName]: value.attr },
        exprValues: { [valueName]: value.value },
      };
    }

    case 'minus': {
      const attrId = generateUniqueId();
      const attrName = `#attr${attrId}`;
      return {
        expr: `${attrName} - ${valueName}`,
        exprAttributes: { [attrName]: value.attr },
        exprValues: { [valueName]: value.value },
      };
    }

    default:
      value satisfies never;
      // TypeScript should ensure this never happens
      throw new Error(`Unknown function: ${(value as any).func}`);
  }
}

// SET expression handler
export function setExpr<T>(
  attr: string,
  operation: SetValueExpr<T>,
): ExprResult {
  const id = generateUniqueId();
  const attrName = `#attr${id}`;

  const setValue = buildSetValue(operation);

  return {
    expr: `${attrName} = ${setValue.expr}`,
    exprAttributes: {
      [attrName]: attr,
      ...setValue.exprAttributes,
    },
    exprValues: setValue.exprValues,
  };
}

// ADD expression handler
export function addExpr<T>(attr: string, value: T): ExprResult {
  const id = generateUniqueId();
  const attrName = `#attr${id}`;
  const valueName = `:value${id}`;

  return {
    expr: `${attrName} ${valueName}`,
    exprAttributes: { [attrName]: attr },
    exprValues: { [valueName]: value },
  };
}

// REMOVE expression handler
export function removeExpr(attr: string): ExprResult {
  const id = generateUniqueId();
  const attrName = `#attr${id}`;

  return {
    expr: `${attrName}`,
    exprAttributes: { [attrName]: attr },
    exprValues: {},
  };
}

// DELETE expression handler
export function deleteExpr<T>(value: T, attr: string): ExprResult {
  const id = generateUniqueId();
  const attrName = `#attr${id}`;
  const valueName = `:value${id}`;

  return {
    expr: `${attrName} ${valueName}`,
    exprAttributes: { [attrName]: attr },
    exprValues: { [valueName]: value },
  };
}

// Main update expression builder
export function updateExpr<
  T extends Record<string, unknown> = Record<string, unknown>,
>(parameters: UpdateExprParameters<T>): UpdateExprResult {
  const expressionParts: string[] = [];
  const allResults: ExprResult[] = [];

  // Process SET operations
  if (parameters.SET) {
    const setResults = Object.entries(parameters.SET).map(([attr, value]) =>
      setExpr(attr, value),
    );
    allResults.push(...setResults);
    expressionParts.push(`SET ${setResults.map((r) => r.expr).join(', ')}`);
  }

  // Process ADD operations
  if (parameters.ADD) {
    const addResults = parameters.ADD.map(({ attr, value }) =>
      addExpr(attr, value),
    );
    allResults.push(...addResults);
    expressionParts.push(`ADD ${addResults.map((v) => v.expr).join(', ')}`);
  }

  // Process REMOVE operations
  if (parameters.REMOVE) {
    const removeResults = parameters.REMOVE.map((attr) => removeExpr(attr));
    allResults.push(...removeResults);
    expressionParts.push(
      `REMOVE ${removeResults.map((v) => v.expr).join(', ')}`,
    );
  }

  // Process DELETE operations
  if (parameters.DELETE) {
    const deleteResults = parameters.DELETE.map(({ attr, value }) =>
      deleteExpr(value, attr),
    );
    allResults.push(...deleteResults);
    expressionParts.push(
      `DELETE ${deleteResults.map((v) => v.expr).join(', ')}`,
    );
  }

  return {
    updateExpression: expressionParts.join(' '),
    ...mergeExprResults(allResults),
  };
}
