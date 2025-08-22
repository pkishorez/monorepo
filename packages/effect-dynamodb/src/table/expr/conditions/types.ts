import type { AttributeValue } from 'dynamodb-client';
import type { CompoundIndexDefinition, IndexDefinition } from '../../types.js';
import type { AttrValueType, StringAttr } from '../expr-utils/types.js';

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
  value: keyof AttributeValue;
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
  | { type: 'and'; value: ConditionExprParameters<Type>[] }
  | { type: 'or'; value: ConditionExprParameters<Type>[] };

