/* eslint-disable ts/no-empty-object-type */
import type { ExprResult } from './types.js';
import { AttributeMapBuilder } from './utils.js';

export type ProjectionKeys<Item, Index = {}> = ((
  | {
      [K in keyof Index]: Index[K];
    }[keyof Index]
  | keyof Item
) &
  string)[];
export type ProjectedItem<Item, Keys extends (keyof Item)[] | undefined> = Pick<
  Item,
  Exclude<Keys, undefined>[number]
>;

export function projectionExpr(attrs: string[]): ExprResult {
  const attrMapBuilder = new AttributeMapBuilder('proj_');

  const condition = attrs
    .map((key) => attrMapBuilder.setAttrName(key))
    .join(', ');

  return { expr: condition, ...attrMapBuilder.build() };
}
