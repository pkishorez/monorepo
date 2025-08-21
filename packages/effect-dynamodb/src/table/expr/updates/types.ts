// Update expressions for DynamoDB SET, ADD, REMOVE, DELETE operations

// SET value expression with support for DynamoDB functions
export type SetValueExpr<T = unknown> =
  | T  // Direct value
  | { func: 'list_append'; lists: [string, T] }  // list_append(attr, value)
  | { func: 'if_not_exists'; attr: string; default: T }  // if_not_exists(attr, default)
  | { func: 'plus'; attr: string; value: T }  // attr + value
  | { func: 'minus'; attr: string; value: T }; // attr - value

// Update expression types
export type UpdateExpr<T = unknown> =
  | { type: 'SET'; value: SetValueExpr<T> }
  | { type: 'ADD'; value: T }
  | { type: 'REMOVE' }  // REMOVE doesn't need a value
  | { type: 'DELETE'; value: T };  // For removing items from sets

// Specialized update expressions for different operations
export interface SetExpr<T> {
  type: 'SET';
  value: SetValueExpr<T>;
}

export interface AddExpr<T> {
  type: 'ADD';
  value: T;  // For numbers (increment) or sets (union)
}

export interface RemoveExpr {
  type: 'REMOVE';
  // REMOVE operations don't have values, they just remove the attribute or list element
}

export interface DeleteExpr<T> {
  type: 'DELETE';
  value: T;  // For removing specific values from sets
}

// Attribute-based update operations
export interface AttributeUpdateExpr<T> {
  attr: string;
  operation: UpdateExpr<T>;
}

// Update expression parameters - uses DynamoDB's natural grouping
export interface UpdateExprParameters {
  SET?: Array<{ attr: string; value: SetValueExpr }>;
  ADD?: Array<{ attr: string; value: unknown }>;
  REMOVE?: Array<{ attr: string }>;
  DELETE?: Array<{ attr: string; value: unknown }>;
}

// Result type for update expressions
export interface UpdateExprResult {
  updateExpression: string;
  exprAttributes: Record<string, string>;
  exprValues: Record<string, unknown>;
}