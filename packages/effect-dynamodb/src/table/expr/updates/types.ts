// Update expressions for DynamoDB SET, ADD, REMOVE, DELETE operations

import type { AttrValueType, StringAttr } from '../expr-utils/types.js';

// eslint-disable-next-line ts/consistent-type-definitions
type Assignment<T> = { op: 'assign'; value: T };
// SET value expression with support for DynamoDB functions
type SetOpExpr<T = unknown, Attr = string> =
  | { op: 'list_append'; attr: Attr; list: T[] } // list_append(attr, value)
  | { op: 'if_not_exists'; attr: Attr; default: T } // if_not_exists(attr, default)
  | { op: 'plus'; attr: Attr; value: T } // attr + value
  | { op: 'minus'; attr: Attr; value: T }; // attr - value

export type SetValueExpr<T, Attr extends StringAttr<T> = StringAttr<T>> =
  | SetOpExpr<AttrValueType<T, Attr>, Attr>
  | Assignment<AttrValueType<T, Attr>>;

// Base interface for update operations
interface BaseUpdateExprParameters<
  T,
  Attr extends StringAttr<T> = StringAttr<T>,
> {
  SET?: {
    [K in Attr]?: SetValueExpr<T, Attr>;
  };
  REMOVE?: Array<Attr>;
  ADD?: {
    [K in Attr]?: AttrValueType<T, Attr>;
  };
  DELETE?: {
    [K in Attr]?: AttrValueType<T, Attr>;
  };
}

// Update expression parameters - requires at least one operation
export type UpdateExprParameters<
  T = unknown,
  Attr extends StringAttr<T> = StringAttr<T>,
> = BaseUpdateExprParameters<T, Attr> &
  (
    | { SET: NonNullable<BaseUpdateExprParameters<T, Attr>['SET']> }
    | { ADD: NonNullable<BaseUpdateExprParameters<T, Attr>['ADD']> }
    | { REMOVE: NonNullable<BaseUpdateExprParameters<T, Attr>['REMOVE']> }
    | { DELETE: NonNullable<BaseUpdateExprParameters<T, Attr>['DELETE']> }
  );

// Result type for update expressions
export interface UpdateExprResult {
  updateExpression: string;
  exprAttributes: Record<string, string>;
  exprValues: Record<string, unknown>;
}
