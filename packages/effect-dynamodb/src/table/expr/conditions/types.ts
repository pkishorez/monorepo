import type { AttributeValue } from 'dynamodb-client';
import type { CompoundIndexDefinition, IndexDefinition } from '../../types.js';
import type { AttrValueType, StringAttr } from '../expr-utils/types.js';

// Granular expression types
export type ComparisonExpr<T> =
  | { '<': T }
  | { '<=': T }
  | { '>': T }
  | { '>=': T }
  | { '=': T };

export type StringExpr<T = any> = { beginsWith: T } | { contains: T };

export interface RangeExpr<T> {
  between: [T, T];
}

export interface ExistenceExpr {
  exists: boolean;
}

export interface AttrTypeExpr {
  attrType: keyof AttributeValue;
}

export interface SizeExpr {
  size: ComparisonExpr<number>;
}

// Composite types
export type KeyConditionExpr<T> =
  | ComparisonExpr<T>
  | Extract<StringExpr<T>, { beginsWith: any }>
  | RangeExpr<T>;

export type KeyConditionExprParameters<Index extends IndexDefinition> =
  Index extends CompoundIndexDefinition
    ? { pk: string; sk?: string | KeyConditionExpr<string> }
    : { pk: string };

export type ConditionExpr<T> =
  | ComparisonExpr<T>
  | StringExpr<T>
  | RangeExpr<T>
  | ExistenceExpr
  | AttrTypeExpr
  | SizeExpr;

// Base condition with attribute mapping
export interface AttributeConditionExpr<
  T,
  Attr extends StringAttr<T> = StringAttr<T>,
> {
  attr: Attr;
  condition: ConditionExpr<AttrValueType<T, Attr>>;
}

// Compound expression parameters including logical operations
export type ConditionExprParameters<Type> =
  | AttributeConditionExpr<Type>
  | { and: ConditionExprParameters<Type>[] }
  | { or: ConditionExprParameters<Type>[] };
