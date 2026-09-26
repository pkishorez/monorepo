import { Schema } from 'effect';
import type { Entity } from '../../../core/index.js';

/**
 * The Collection's Entity codec. A state schema uses it for every Entity it
 * holds, so a cursor is stored in encoded form and migrated when it is read.
 */
export type StateEntitySchema = Schema.Codec<
  Entity<any>,
  unknown,
  never,
  never
>;

/**
 * How a strategy's Sync State is stored. `schema` is the one codec for the
 * whole state; it receives the Collection's Entity codec for any Entity the
 * state holds.
 */
export type StrategyStateSpec<TState> = {
  schema: (
    entity: StateEntitySchema,
  ) => Schema.Codec<TState, unknown, never, never>;
  empty: TState;
};

export const noStrategyState = (): StrategyStateSpec<null> => ({
  schema: () => Schema.Null,
  empty: null,
});
