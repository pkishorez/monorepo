import type { IndexDefinition } from '../../types.js';
import type { ExprResult } from '../types.js';
import type { KeyConditionExprParameters } from './types.js';
import { AttributeMapBuilder } from '../utils.js';

// Main update expression builder
export function keyConditionExpr(
  index: IndexDefinition,
  { pk, sk }: KeyConditionExprParameters,
): ExprResult {
  const attrBuilder = new AttributeMapBuilder('keycond_');

  const expr: string[] = [];
  const { attrKey, attrValue } = attrBuilder.setAttr(index.pk, pk);
  expr.push(`${attrKey} = ${attrValue}`);

  if (sk && 'sk' in index) {
    if (typeof sk === 'string') {
      const { attrKey, attrValue } = attrBuilder.setAttr(index.sk, sk);
      expr.push(`${attrKey} = ${attrValue}`);
    } else if ('beginsWith' in sk) {
      const { attrKey, attrValue } = attrBuilder.setAttr(
        index.sk,
        sk.beginsWith,
      );
      expr.push(`begins_with(${attrKey}, ${attrValue})`);
    } else if ('between' in sk) {
      const { attrKey, attrValue } = attrBuilder.setAttr(
        index.sk,
        sk.between[0],
      );
      const attrValue2 = attrBuilder.setAttrValue(sk.between[1]);
      expr.push(`${attrKey} BETWEEN ${attrValue} AND ${attrValue2}`);
    } else if ('<' in sk) {
      const { attrKey, attrValue } = attrBuilder.setAttr(index.sk, sk['<']);
      expr.push(`${attrKey} < ${attrValue}`);
    } else if ('>' in sk) {
      const { attrKey, attrValue } = attrBuilder.setAttr(index.sk, sk['>']);
      expr.push(`${attrKey} > ${attrValue}`);
    } else if ('<=' in sk) {
      const { attrKey, attrValue } = attrBuilder.setAttr(index.sk, sk['<=']);
      expr.push(`${attrKey} <= ${attrValue}`);
    } else if ('>=' in sk) {
      const { attrKey, attrValue } = attrBuilder.setAttr(index.sk, sk['>=']);
      expr.push(`${attrKey} >= ${attrValue}`);
    }
  }

  return {
    expr: expr.join(' AND '),
    ...attrBuilder.build(),
  };
}
