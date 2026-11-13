import type {
  ActorOf,
  AnyActor,
  KidsIn,
  Only,
  Tagged,
  Types,
} from '../../actor/index.ts';
import type { Address } from '../address/index.ts';

/*
 * The app as data: one Snapshot of every Instance. An Instance holds only
 * what its Actor's code reads and what places it in the tree; everything
 * else, the Workers that should run and the Children that should exist, is
 * worked out from it.
 */

/**
 * One running Actor in the tree, as data, typed by its Actor and narrowed by
 * its State: `_tag` repeats the State's tag at the top, so a check on it
 * narrows `state` and `children` together. Each Child is its own Actor's
 * Instance, one, or a list for an `each`; one there only `while` a test
 * holds may be absent. Of no Actor in particular, it is any Actor's,
 * untyped: what tools read.
 */
export type Instance<A = AnyActor> = Known<A> extends true ? Typed<A> : Untyped;

interface Untyped {
  /** Its State's tag. */
  readonly _tag: string;
  readonly address: Address;
  /** Its key, if it is held under one. */
  readonly key?: string;
  /** Its Actor's name. */
  readonly actor: string;
  readonly state: Tagged;
  readonly model: unknown;
  /**
   * What its parent hands it now, if its Actor declares Props. Worked out by
   * the parent, never written by the Instance.
   */
  readonly props?: unknown;
  /** A fixed Child by its slot; the Children of an `each` by their slot, in the order of their keys. */
  readonly children: Readonly<Record<string, Untyped | ReadonlyArray<Untyped>>>;
  /** How many times this Instance has Invoked each slot and key, for the next Address. */
  readonly invoked: Readonly<Record<string, number>>;
}

type Typed<A> = {
  [T in Types<A>['state']['_tag']]: {
    readonly _tag: T;
    readonly address: Address<A>;
    readonly key?: string;
    readonly actor: NameOf<A>;
    readonly state: Only<Types<A>['state'], T>;
    readonly model: Types<A>['model'];
    readonly props?: PropsOf<A>;
    readonly children: ChildrenOf<KidsIn<A, T>>;
    readonly invoked: Readonly<Record<string, number>>;
  };
}[Types<A>['state']['_tag']];

/**
 * Whether `A` is an Actor whose types are known: one named by `define`, not
 * any Actor, nor none. Read from `A` alone, so an Instance of an Actor is an
 * Instance of any Actor.
 */
type Known<A> = A extends { readonly name: infer N }
  ? string extends N
    ? false
    : true
  : false;

type NameOf<A> = A extends { readonly name: infer N extends string }
  ? N
  : string;

/** Its Props; none for an Actor that declares none. */
type PropsOf<A> = [Types<A>['props']] extends [void]
  ? never
  : Types<A>['props'];

/** The slots of a Child there only `while` its test holds. */
type Maybe<K> = {
  [S in keyof K]: K[S] extends { readonly while: Function } ? S : never;
}[keyof K];

/** A Child as the Snapshot holds it: one Instance, or a list for an `each`. */
type ChildIn<C> = C extends { readonly each: Function }
  ? ReadonlyArray<Instance<ActorOf<C>> & { readonly key: string }>
  : Instance<ActorOf<C>>;

/** The Children one State holds, by slot: optional when there only `while` a test holds. */
type ChildrenOf<K> = Flat<
  { readonly [S in Exclude<keyof K, Maybe<K>>]: ChildIn<K[S]> } & {
    readonly [S in Maybe<K>]?: ChildIn<K[S]>;
  }
>;

type Flat<T> = { [K in keyof T]: T[K] };

/** The whole app as one value: every Instance, and the app's Time. */
export interface Snapshot<A = AnyActor> {
  readonly root: Instance<A>;
  /** The app's Time, in milliseconds: the Time of the last entry played, 0 right after init. */
  readonly at: number;
}
