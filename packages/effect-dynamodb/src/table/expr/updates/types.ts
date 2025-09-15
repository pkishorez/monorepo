export type UpdateExprParameters<TItem = unknown> = {
  [K in keyof TItem]?: TItem[K];
};
