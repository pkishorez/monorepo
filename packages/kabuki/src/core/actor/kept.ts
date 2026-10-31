import type { Effect } from 'effect';
import type { BlockOf, KidsOf } from './behavior.ts';
import type { Types } from './definition.ts';
import type { Tagged } from './instance.ts';

/*
 * What an Actor's type keeps of its behavior is only what Views and code
 * outside the tree read: each Child's Actor and kind, each Query's args and
 * answer. Never the behavior as written, which holds every function's type
 * and, through each Child, its whole subtree's: kept, it is printed again in
 * every hover, error and declaration file that names the Actor, once per
 * level it is kept at, so its size grows with each level of Children.
 * Each map is written in place rather than named, so it is printed as its
 * plain shape, never as an alias of the behavior, and stays indexable while
 * its arguments are generic; `BuiltOf` maps over `KidsByState` and
 * `QueriesByState` in place for the same reason.
 */

/** A Child as an Actor's type keeps it: its Actor, and whether it is one of `each` or there `while` a test holds. */
export type SlotOf<C> = C extends {
  readonly actor: infer A;
  readonly each: Function;
}
  ? { readonly actor: A; readonly each: Function }
  : C extends { readonly actor: infer A; readonly while: Function }
    ? { readonly actor: A; readonly while: Function }
    : C extends { readonly actor: infer A }
      ? { readonly actor: A }
      : never;

/** The Children per State tag, top-level ones in every State, for Views. */
export type KidsByState<State extends Tagged, B> = {
  readonly [T in State['_tag']]: {
    readonly [K in keyof (KidsOf<B> & KidsOf<BlockOf<B, T>>)]: SlotOf<
      (KidsOf<B> & KidsOf<BlockOf<B, T>>)[K]
    >;
  };
};

/** An Actor's Children in one State, as written: its slots by name. */
export type KidsIn<A, T> = T extends keyof Types<A>['children']
  ? Types<A>['children'][T]
  : {};

/** A Child as its parent finds it, each Instance as `N`: a list of `each`, one that may be absent `while` its test is false, else one always there. */
export type ChildAs<C, N> = C extends { readonly each: Function }
  ? ReadonlyArray<N & { readonly key: string }>
  : C extends { readonly while: Function }
    ? N | undefined
    : N;

/** The Queries of a level, as written. */
export type QueriesOf<L> = L extends { readonly queries: infer Q } ? Q : {};

/** A Query as an Actor's type keeps it: its args, answer and failure, not what its `self` reads. */
export type AskOf<Q> = Q extends {
  readonly run: (...params: infer P) => Effect.Effect<infer A, infer E, any>;
}
  ? { readonly run: (self: never, ...args: ArgsOf<P>) => Effect.Effect<A, E> }
  : never;

/** The Queries per State tag, top-level ones in every State, for code outside the tree. */
export type QueriesByState<State extends Tagged, B> = {
  readonly [T in State['_tag']]: {
    readonly [K in keyof (QueriesOf<B> & QueriesOf<BlockOf<B, T>>)]: AskOf<
      (QueriesOf<B> & QueriesOf<BlockOf<B, T>>)[K]
    >;
  };
};

/** An Actor's Queries in one State, as written: by name. */
export type QueriesIn<A, T> = T extends keyof Types<A>['queries']
  ? Types<A>['queries'][T]
  : {};

/**
 * A Query as code outside the tree asks it: its args, if its `run` takes
 * any, to an Effect with its answer, failing with its own failure or
 * `Stopped`, and needing nothing, since the Instance supplies its
 * Capabilities. `S` is the Runtime's `Stopped`.
 */
export type QueryAs<Q, S> = Q extends {
  readonly run: (...params: infer P) => Effect.Effect<infer A, infer E, any>;
}
  ? (...args: ArgsOf<P>) => Effect.Effect<A, E | S>
  : never;

/** A Query's `run` parameters without `self`, optional ones kept so. */
export type ArgsOf<P> = P extends [any, ...infer Args] ? Args : [];
