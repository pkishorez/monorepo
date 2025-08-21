import type { AttrExprResult } from '../expr-utils/index.js';
import type {
  AddExpr,
  DeleteExpr,
  SetExpr,
  SetValueExpr,
  UpdateExpr,
  UpdateExprParameters,
  UpdateExprResult,
} from './types.js';
import { generateUniqueId, mergeExprResults } from '../expr-utils/index.js';

// Helper to handle SET value expressions (functions or direct values)
function buildSetValue<T>(value: SetValueExpr<T>): {
  valueExpr: string;
  exprAttributes: Record<string, string>;
  exprValues: Record<string, unknown>;
} {
  // Direct value case
  if (value === null || typeof value !== 'object' || !('func' in value)) {
    const id = generateUniqueId();
    const valueName = `:value${id}`;
    return {
      valueExpr: valueName,
      exprAttributes: {},
      exprValues: { [valueName]: value },
    };
  }

  // Function expression cases
  const id = generateUniqueId();
  const valueName = `:value${id}`;

  switch (value.func) {
    case 'list_append': {
      const attrId = generateUniqueId();
      const attrName = `#attr${attrId}`;
      return {
        valueExpr: `list_append(${attrName}, ${valueName})`,
        exprAttributes: { [attrName]: value.lists[0] },
        exprValues: { [valueName]: value.lists[1] },
      };
    }

    case 'if_not_exists': {
      const attrId = generateUniqueId();
      const attrName = `#attr${attrId}`;
      return {
        valueExpr: `if_not_exists(${attrName}, ${valueName})`,
        exprAttributes: { [attrName]: value.attr },
        exprValues: { [valueName]: value.default },
      };
    }

    case 'plus': {
      const attrId = generateUniqueId();
      const attrName = `#attr${attrId}`;
      return {
        valueExpr: `${attrName} + ${valueName}`,
        exprAttributes: { [attrName]: value.attr },
        exprValues: { [valueName]: value.value },
      };
    }

    case 'minus': {
      const attrId = generateUniqueId();
      const attrName = `#attr${attrId}`;
      return {
        valueExpr: `${attrName} - ${valueName}`,
        exprAttributes: { [attrName]: value.attr },
        exprValues: { [valueName]: value.value },
      };
    }

    default:
      // TypeScript should ensure this never happens
      throw new Error(`Unknown function: ${(value as any).func}`);
  }
}

// SET expression handler
export function setExpr<T>(
  operation: SetExpr<T>,
  attr: string,
): AttrExprResult {
  const id = generateUniqueId();
  const attrName = `#attr${id}`;

  const setValue = buildSetValue(operation.value);

  return {
    expr: `SET ${attrName} = ${setValue.valueExpr}`,
    exprAttributes: {
      [attrName]: attr,
      ...setValue.exprAttributes,
    },
    exprValues: setValue.exprValues,
  };
}

// ADD expression handler
export function addExpr<T>(
  operation: AddExpr<T>,
  attr: string,
): AttrExprResult {
  const id = generateUniqueId();
  const attrName = `#attr${id}`;
  const valueName = `:value${id}`;

  return {
    expr: `ADD ${attrName} ${valueName}`,
    exprAttributes: { [attrName]: attr },
    exprValues: { [valueName]: operation.value },
  };
}

// REMOVE expression handler
export function removeExpr(attr: string): AttrExprResult {
  const id = generateUniqueId();
  const attrName = `#attr${id}`;

  return {
    expr: `REMOVE ${attrName}`,
    exprAttributes: { [attrName]: attr },
    exprValues: {},
  };
}

// DELETE expression handler
export function deleteExpr<T>(
  operation: DeleteExpr<T>,
  attr: string,
): AttrExprResult {
  const id = generateUniqueId();
  const attrName = `#attr${id}`;
  const valueName = `:value${id}`;

  return {
    expr: `DELETE ${attrName} ${valueName}`,
    exprAttributes: { [attrName]: attr },
    exprValues: { [valueName]: operation.value },
  };
}

// Main function to handle any update operation
export function attrUpdateExpr<T>(
  operation: UpdateExpr<T>,
  attr: string,
): AttrExprResult {
  switch (operation.type) {
    case 'SET':
      return setExpr(operation, attr);
    case 'ADD':
      return addExpr(operation, attr);
    case 'REMOVE':
      return removeExpr(attr);
    case 'DELETE':
      return deleteExpr(operation, attr);
  }
}

// Main update expression builder
export function updateExpr(parameters: UpdateExprParameters): UpdateExprResult {
  const expressionParts: string[] = [];
  const allResults: AttrExprResult[] = [];

  // Process SET operations
  if (parameters.SET) {
    const setResults = parameters.SET.map(({ attr, value }) =>
      setExpr({ type: 'SET', value }, attr),
    );
    allResults.push(...setResults);
    const setExpressions = setResults.map((r) => r.expr.substring(4)); // Remove "SET "
    expressionParts.push(`SET ${setExpressions.join(', ')}`);
  }

  // Process ADD operations
  if (parameters.ADD) {
    const addResults = parameters.ADD.map(({ attr, value }) =>
      addExpr({ type: 'ADD', value }, attr),
    );
    allResults.push(...addResults);
    const addExpressions = addResults.map((r) => r.expr.substring(4)); // Remove "ADD "
    expressionParts.push(`ADD ${addExpressions.join(', ')}`);
  }

  // Process REMOVE operations
  if (parameters.REMOVE) {
    const removeResults = parameters.REMOVE.map(({ attr }) => removeExpr(attr));
    allResults.push(...removeResults);
    const removeExpressions = removeResults.map((r) => r.expr.substring(7)); // Remove "REMOVE "
    expressionParts.push(`REMOVE ${removeExpressions.join(', ')}`);
  }

  // Process DELETE operations
  if (parameters.DELETE) {
    const deleteResults = parameters.DELETE.map(({ attr, value }) =>
      deleteExpr({ type: 'DELETE', value }, attr),
    );
    allResults.push(...deleteResults);
    const deleteExpressions = deleteResults.map((r) => r.expr.substring(7)); // Remove "DELETE "
    expressionParts.push(`DELETE ${deleteExpressions.join(', ')}`);
  }

  const merged =
    allResults.length > 0
      ? mergeExprResults(allResults)
      : { exprAttributes: {}, exprValues: {} };

  return {
    updateExpression: expressionParts.join(' '),
    exprAttributes: merged.exprAttributes,
    exprValues: merged.exprValues,
  };
}

