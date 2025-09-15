export type ConditionExprParameters<TItem = unknown> = {
  [K in keyof TItem]?: TItem[K];
};
