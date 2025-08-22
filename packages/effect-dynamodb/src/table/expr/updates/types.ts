// Update expressions for DynamoDB SET, ADD, REMOVE, DELETE operations

import type { AttrValueType, StringAttr } from '../expr-utils/types.js';

// SET value expression with support for DynamoDB functions
export type SetValueExpr<T = unknown, Attr = string> =
  | { op: 'direct'; value: T }
  | { op: 'list_append'; attr: Attr; list: T[] } // list_append(attr, value)
  | { op: 'if_not_exists'; attr: Attr; default: T } // if_not_exists(attr, default)
  | { op: 'plus'; attr: Attr; value: T } // attr + value
  | { op: 'minus'; attr: Attr; value: T }; // attr - value

// Update expression parameters - uses DynamoDB's natural grouping
export interface UpdateExprParameters<
  T extends Record<string, unknown> = Record<string, unknown>,
  Attr extends StringAttr<T> = StringAttr<T>,
> {
  SET?: Array<{
    attr: Attr;
    value: SetValueExpr<AttrValueType<T, Attr>, Attr>;
  }>;
  REMOVE?: Array<{ attr: Attr }>;

  ADD?: Array<{ attr: Attr; value: AttrValueType<T, Attr> }>;
  DELETE?: Array<{ attr: Attr; value: AttrValueType<T, Attr> }>;
}

// Result type for update expressions
export interface UpdateExprResult {
  updateExpression: string;
  exprAttributes: Record<string, string>;
  exprValues: Record<string, unknown>;
}
