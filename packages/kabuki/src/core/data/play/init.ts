import type { AnyActor, Tagged, Types } from '../../actor/index.ts';
import type { ActorDefinition } from '../../actor/engine/index.ts';
import type { Address } from './path.ts';
import { create } from './invoke.ts';

/*
 * The data: what is, as one Snapshot of every Instance, and what happened,
 * as History entries. Everything here is pure; Effects never run.
 *
 * 1. Init  the root runs init and Invokes its Children, all the way down.
 * 2. Play  one History entry gives the next Snapshot (./play.ts).
 */

/**
 * One running Actor in the tree, as data, typed by its Actor: its State,
 * Model and Props are the Actor's, and each Child is its own Actor's
 * Instance, one, or a list for an `each`. A Child written in a State, or
 * there only `while` a test holds, may be absent. Of no Actor in
 * particular, it is any Actor's, untyped: what tools read.
 */
export interface Instance<A = AnyActor> {
  readonly address: Address<A>;
  /** Its Actor's name. */
  readonly actor: Known<A> extends true ? NameOf<A> : string;
  readonly state: Known<A> extends true ? Types<A>['state'] : Tagged;
  readonly model: Known<A> extends true ? Types<A>['model'] : unknown;
  /**
   * What its parent hands it now, if its Actor declares Props. Worked out by
   * the parent, never written by the Instance.
   */
  readonly props?: Known<A> extends true ? PropsOf<A> : unknown;
  /** The History entry that started it; `null` for one there since init. */
  readonly started: number | null;
  /** The last History entry that changed its State, Model or Props; `null` for none since it started. */
  readonly changed: number | null;
  /** A fixed Child by its slot; the Children of an `each` by their slot, in the order of their keys. */
  readonly children: Known<A> extends true
    ? ChildrenOf<Types<A>['children']>
    : Readonly<Record<string, Instance | ReadonlyArray<Instance>>>;
  /** How many times this Instance has Invoked each slot and key, for the next Address. */
  readonly invoked: Readonly<Record<string, number>>;
}

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

/** Every slot of `K`, its Children per State tag. */
type SlotsOf<K> = { [T in keyof K]: keyof K[T] }[keyof K];

/** The Child at slot `S` in any State, as the Actor's type keeps it. */
type SlotIn<K, S> = {
  [T in keyof K]: S extends keyof K[T] ? K[T][S] : never;
}[keyof K];

/** The slots held in every State by a Child always there: written at the top, neither `while` nor in a State. */
type Held<K> = {
  [S in SlotsOf<K>]: [
    { [T in keyof K]: S extends keyof K[T] ? never : T }[keyof K],
  ] extends [never]
    ? [Extract<SlotIn<K, S>, { readonly while: Function }>] extends [never]
      ? S
      : never
    : never;
}[SlotsOf<K>];

/** A Child as the Snapshot holds it: one Instance, or a list for an `each`. */
type ChildIn<C> = C extends {
  readonly actor: infer B extends AnyActor;
  readonly each: Function;
}
  ? ReadonlyArray<Instance<B>>
  : C extends { readonly actor: infer B extends AnyActor }
    ? Instance<B>
    : never;

/** The Children of an Actor whose Children per State tag are `K`, by slot: optional unless always held. */
type ChildrenOf<K> = Flat<
  { readonly [S in Held<K>]: ChildIn<SlotIn<K, S>> } & {
    readonly [S in Exclude<SlotsOf<K>, Held<K>>]?: ChildIn<SlotIn<K, S>>;
  }
>;

type Flat<T> = { [K in keyof T]: T[K] };

/** The whole app as one value, right after one History entry, or right after init. */
export interface Snapshot<A = AnyActor> {
  /** The History entry it is right after; `null` right after init. */
  readonly entry: number | null;
  readonly root: Instance<A>;
}

/**
 * Who Sent a Message: the Instance, and what in it Sent: its View, a Command
 * by its name, a Worker by its name and key, or what it Provides. Only a
 * Capability's function Sends from another Instance than the one it is for,
 * and an Emit comes from the Child that Emitted it. A Message from outside
 * the tree, by a test, a tool or the server the app runs on, comes from no
 * Instance, named by whoever Sent it; a Restore no one Sent: it was given to
 * the app.
 */
export type From =
  | { readonly kind: 'view'; readonly instance: Address }
  | {
      readonly kind: 'command';
      readonly instance: Address;
      readonly name: string;
    }
  | {
      readonly kind: 'worker';
      readonly instance: Address;
      readonly name: string;
      /** The key an `each` Worker runs for. */
      readonly key?: string;
    }
  | { readonly kind: 'provides'; readonly instance: Address }
  | {
      readonly kind: 'emit';
      /** The Child that Emitted it. */
      readonly instance: Address;
      /** The tag of what it Emitted. */
      readonly name: string;
    }
  | {
      readonly kind: 'outside';
      /** Who Sent it, as code reaching the app from outside named itself. */
      readonly name?: string;
    }
  | { readonly kind: 'restore' };

/** The smallest record of one Message: where it sits, who it is for, who Sent it, and its Time. */
export interface Entry {
  /** Larger than every id before it; never reused while the History lives. */
  readonly id: number;
  /** The entry before it, or `null` right after init. */
  readonly parent: number | null;
  readonly to: Address;
  readonly message: Tagged;
  readonly from: From;
  readonly at: number;
}

// 1. Init
/** The app right after init: the root, at its Actor's name, and every Child its State Invokes. */
export const init = (root: ActorDefinition, input?: unknown): Snapshot => ({
  entry: null,
  root: create(root, root.name as Address, { input }, null),
});
