import type { Get, Paths, Primitive } from 'type-fest';

export type ConditionExprParameters<TItem = unknown> = {
  [K in Paths<TItem, { bracketNotation: true }> as Get<
    TItem,
    K
  > extends Primitive
    ? K
    : never]?: Get<TItem, K>;
};
