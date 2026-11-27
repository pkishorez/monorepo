import type { Effect, Layer, Schema, SubscriptionRef } from 'effect';

/*
 * A Fake pretends to be one service in a browser, in plain Effect:
 *
 * - `state`     the facts it knows, as a Schema, and `initial`, what it
 *               knows when it starts.
 * - `controls`  the few things a person or an agent may do to it: each the
 *               Schema of its payload and what it does to the state.
 * - `layer`     the service the app uses, built over the state, which it
 *               reads and watches for changes.
 *
 * A Fake is a description: it holds no state of its own. A FakeWorld makes
 * its state when its Layer is built.
 */

/** A Schema a Fake reads without services and at once. */
type Codec<T> = Schema.Codec<T, unknown, never, never>;

/** One thing a person or an agent may do to a Fake, as `Fake.control` makes it. */
export interface Control<S, P = any> {
  /** What it is given, decoded from what DevTools sends. */
  readonly payload: Codec<P>;
  /** What it does to the state, or why it cannot: "no computer named mac". */
  readonly run: (
    payload: P,
    state: SubscriptionRef.SubscriptionRef<S>,
  ) => Effect.Effect<void, string>;
}

/**
 * One Fake, as `Fake.make` makes it. `Out` is `never` unless named: a
 * Layer's outputs are contravariant, so `Fake` alone takes any Fake.
 */
export interface Fake<
  Name extends string = string,
  S = any,
  Out = never,
  E = any,
  R = any,
> {
  /** Who it is in its FakeWorld: unique there. */
  readonly name: Name;
  readonly state: Codec<S>;
  readonly initial: S;
  readonly controls: { readonly [name: string]: Control<S> };
  /** The service the app uses, over the state its FakeWorld made. */
  readonly layer: (
    state: SubscriptionRef.SubscriptionRef<S>,
  ) => Layer.Layer<Out, E, R>;
}

/** The state of a Fake. */
export type StateOf<F extends Fake> = F['initial'];

/** The services a Fake's Layer gives. */
export type OutOf<F> =
  F extends Fake<any, any, infer Out, any, any> ? Out : never;

/** What building a Fake's Layer may fail with. */
export type ErrorOf<F> =
  F extends Fake<any, any, any, infer E, any> ? E : never;

/** What a Fake's Layer needs from outside: nothing, for most. */
export type NeedsOf<F> =
  F extends Fake<any, any, any, any, infer R> ? R : never;

// The state is typed by its Schema alone: `initial`, each control and the
// Layer are checked against it, never widen it.
const make = <
  const Name extends string,
  S,
  Out = never,
  E = never,
  R = never,
>(fake: {
  readonly name: Name;
  readonly state: Codec<S>;
  readonly initial: NoInfer<S>;
  readonly controls: { readonly [name: string]: Control<NoInfer<S>> };
  readonly layer: (
    state: SubscriptionRef.SubscriptionRef<NoInfer<S>>,
  ) => Layer.Layer<Out, E, R>;
}): Fake<Name, S, Out, E, R> => fake;

// The state's Schema is there for its type alone. TypeScript does not carry
// `state` from `make`'s own argument into a call written inside it, so a
// control named only its payload would see its state as `unknown`.
const control = <S, P>(
  _state: Codec<S>,
  payload: Codec<P>,
  run: (
    payload: P,
    state: SubscriptionRef.SubscriptionRef<S>,
  ) => Effect.Effect<void, string>,
): Control<S, P> => ({ payload, run });

/**
 * A Fake. `make` takes its name, the Schema of its state and where it
 * starts, its controls and its Layer; `control` makes one control from the
 * Schema of the state it changes, which types it, the Schema of its payload
 * and what it does.
 */
export const Fake = { make, control };
