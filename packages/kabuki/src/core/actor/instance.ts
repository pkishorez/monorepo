import type { Context, Effect, Stream } from 'effect';

/*
 * The words every Actor is written in: a tagged value, the Capabilities it
 * Requires, and what an Instance holds at one moment and gives its own work.
 */

export type Tagged = { readonly _tag: string };

/** The one State of an Actor declared without States. */
export type Single = { readonly _tag: 'Single' };

export type AnyKey = Context.Key<any, any>;
/** The Capabilities an Actor's own code may use. */
export type Requires = ReadonlyArray<AnyKey>;

export type IdsOf<R extends Requires> = R[number] extends infer K
  ? K extends Context.Key<infer I, any>
    ? I
    : never
  : never;

export type Only<U, T> = Extract<U, { readonly _tag: T }>;

/** An Instance's data at one moment: its own Model and State, and the Props its parent hands it. */
export type Data<Model, State, Props = void> = {
  readonly model: Model;
  readonly state: State;
  /** What the parent hands it now. Read only: a change runs none of its rules. */
  readonly props: Props;
};

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
   * The app's Time now, in milliseconds since the Runtime started: the clock
   * Messages are stamped with, which stands still while stopped. A Worker
   * that waits until a Time in the Model sleeps for `that - now`, so it waits
   * only what is left when it starts again on a resume or a fork.
   */
  readonly now: Effect.Effect<number>;
}
