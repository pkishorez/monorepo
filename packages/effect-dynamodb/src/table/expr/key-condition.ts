import type { IndexDefinition } from '../types.js';
import type { ExprResult } from './types.js';
import { AttributeMapBuilder } from './utils.js';

export interface KeyConditionExprParameters<T = string> {
  pk: string;
  sk?: undefined | string | SortKeyparameter<T> | null;
}

export type SortKeyparameter<Type = string> =
  | { beginsWith: string }
  | { between: [Type, Type] }
  | { '<': Type }
  | { '<=': Type }
  | { '>': Type }
  | { '>=': Type };

// Main update expression builder
export function keyConditionExpr(
  index: IndexDefinition,
  { pk, sk }: KeyConditionExprParameters,
): ExprResult {
  const attrBuilder = new AttributeMapBuilder('k_');

  const expr: string[] = [];
  expr.push(`${attrBuilder.attr(index.pk)} = ${attrBuilder.value(pk)}`);

  if (sk && 'sk' in index) {
    const skAttr = attrBuilder.attr(index.sk);
    if (typeof sk === 'string') {
      expr.push(`${skAttr} = ${attrBuilder.value(sk)}`);
    } else if ('beginsWith' in sk) {
      expr.push(`begins_with(${skAttr}, ${attrBuilder.value(sk.beginsWith)})`);
    } else if ('between' in sk) {
      expr.push(
        `${skAttr} BETWEEN ${attrBuilder.value(sk.between[0])} AND ${attrBuilder.value(sk.between[1])}`,
      );
    } else if ('<' in sk) {
      expr.push(`${skAttr} < ${attrBuilder.value(sk['<'])}`);
    } else if ('>' in sk) {
      expr.push(`${skAttr} > ${attrBuilder.value(sk['>'])}`);
    } else if ('<=' in sk) {
      expr.push(`${skAttr} <= ${attrBuilder.value(sk['<='])}`);
    } else if ('>=' in sk) {
      expr.push(`${skAttr} >= ${attrBuilder.value(sk['>='])}`);
    }
  }

  return {
    expr: expr.join(' AND '),
    attrResult: attrBuilder.build(),
  };
}
