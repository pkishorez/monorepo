import type { Get, Paths } from 'type-fest';

export type UpdateExprParameters<TItem = unknown> = {
  set: {
    [K in Paths<TItem, { bracketNotation: true }>]?: Get<TItem, K>;
  };
};
