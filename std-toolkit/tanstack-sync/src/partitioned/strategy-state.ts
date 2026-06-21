import { Schema } from 'effect';

export type StrategyStateSpec<TState> = {
  schema: Schema.Codec<TState, unknown, never, never>;
  empty: TState;
};

export const noStrategyState = (): StrategyStateSpec<null> => ({
  schema: Schema.Null,
  empty: null,
});
