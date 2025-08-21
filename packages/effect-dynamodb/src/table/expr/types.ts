import type { CompoundIndexDefinition, IndexDefinition } from '../types.js';

// Granular expression types
export type ComparisonExpr<T> =
  | { type: '<'; value: T }
  | { type: '<='; value: T }
  | { type: '>'; value: T }
  | { type: '>='; value: T }
  | { type: '='; value: T };

export type StringExpr<T extends string = string> =
  | { type: 'beginsWith'; value: T }
  | { type: 'contains'; value: T };

export interface RangeExpr<T> {
  type: 'between';
  value: [T, T];
}

export interface ExistenceExpr {
  type: 'exists';
  value: boolean;
}

export interface AttrTypeExpr {
  type: 'attrType';
  value: string;
}

export interface SizeExpr {
  type: 'size';
  value: ComparisonExpr<number>;
}

// Composite types
export type KeyConditionExpr<T> =
  | ComparisonExpr<T>
  | Extract<StringExpr<T extends string ? T : never>, { type: 'beginsWith' }>
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
export interface AttributeConditionExpr<T> {
  attr: string;
  condition: ConditionExpr<T>;
}

// Compound expression parameters including logical operations
export type ConditionExprParameters<Type> =
  | AttributeConditionExpr<Type>
  | { type: 'and'; value: ConditionExprParameters<Type>[] }
  | { type: 'or'; value: ConditionExprParameters<Type>[] };

// Result types
export interface AttrExprResult {
  expr: string;
  exprAttributes: Record<string, string>;
  exprValues: Record<string, unknown>;
}

export interface CompoundExprResult {
  condition: string;
  exprAttributes: Record<string, string>;
  exprValues: Record<string, unknown>;
}

