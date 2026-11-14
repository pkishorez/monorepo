import type { Effect, Stream } from 'effect';
import type { Data } from './definition/index.ts';

/*
 * What an Instance gives its own work: its Self.
 */

/**
 * What an Instance's own work holds of it: Workers and Provides. Sends go
 * only to this Instance; `get` and `changes` are always current.
 */
export interface Self<Model, State, Msg, Props = void> {
  readonly id: string;
  readonly send: (message: Msg) => Effect.Effect<void>;
  readonly get: Effect.Effect<Data<Model, State, Props>>;
  /** The current data, then each new value after a Message or the parent changes it. */
  readonly changes: Stream.Stream<Data<Model, State, Props>>;
  /**
   * The app's Time now, in milliseconds: the clock Messages are stamped
   * with, carried on from its Snapshot's Time when a Runtime is made or
   * follows one, and standing still while it is stopped. A Worker
   * that waits until a Time in the Model sleeps for `that - now`, so it waits
   * only what is left when it starts again on a resume or a fork.
   */
  readonly now: Effect.Effect<number>;
}
