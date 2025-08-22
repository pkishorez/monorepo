import type { AttributeValue } from 'dynamodb-client';
import type { CompoundIndexDefinition, IndexDefinition } from '../../types.js';
import type { ExprResult } from '../expr-utils/index.js';
import type { AttrValueType, StringAttr } from '../expr-utils/types.js';

// Granular expression types
export type ComparisonExpr<T> =
  | { '<': T }
  | { '<=': T }
  | { '>': T }
  | { '>=': T }
  | { '=': T };

export type StringExpr<T = unknown> = { beginsWith: T } | { contains: T };

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

export type AttributeConditionExpr<
  T = unknown,
  Attr extends StringAttr<T> = StringAttr<T>,
> = Record<Attr, ConditionExpr<AttrValueType<T, Attr>>>;

export type ConditionArrExpr<Type> = AttributeConditionExpr<Type>[];

// New types for functional composition architecture
// Simple object notation for convenience: { name: { '=': 'John' }, age: { '>': 18 } }
export type SimpleConditionExpr<T> = {
  [K in StringAttr<T>]?: ConditionExpr<AttrValueType<T, K>>;
};

// Union type that accepts multiple input formats
export type ExprInput<T> =
  | ExprResult // Already processed expression
  | SimpleConditionExpr<T>; // Simple object: { attr: condition }

// Backward compatibility alias (deprecated - use SimpleConditionExpr or ExprInput)
export type ConditionExprParameters<T> = SimpleConditionExpr<T>;
