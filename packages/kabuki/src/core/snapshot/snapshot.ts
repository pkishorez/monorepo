import type { ActorDefinition, Tagged } from '../actor/index.ts';
import { create } from './invoke.ts';

/*
 * The Snapshot: the whole app as one value, and the only truth about its data.
 * Everything here is pure; Effects never run.
 *
 * 1. Init    the root runs init and Invokes its Children, all the way down.
 * 2. Handle  an Envelope gives the next Snapshot (./handle.ts).
 */

/** One running Actor in the tree. */
export interface Instance {
  readonly id: string;
  /** Its Actor's name. */
  readonly actor: string;
  /** Its key, if it is a keyed Child. */
  readonly key?: string;
  readonly state: Tagged;
  readonly model: unknown;
  /**
   * What its parent hands it now, if its Actor declares Props. Worked out by
   * the parent, never written by the Instance.
   */
  readonly props?: unknown;
  /** A fixed Child by its name; keyed Children by their slot, in the Model's order. */
  readonly children: Readonly<
    Record<string, Instance | ReadonlyArray<Instance>>
  >;
  /** How many times this Instance has Invoked each Child, for the next ID. */
  readonly invoked: Readonly<Record<string, number>>;
}

/** The whole app: its root Instance. */
export type Snapshot = Instance;

/**
 * Who Sent a Message: the Instance, and what in it Sent: its View, a Command
 * by its name, a Worker by its name and key, or what it Provides. Only a
 * Request comes from another Instance than its destination. A Message from outside the tree, by
 * a test, a tool or the server the app runs on, comes from no Instance, named by
 * whoever Sent it; a Restore no one Sent: it was
 * given to the app.
 */
export type Source =
  | { readonly kind: 'view'; readonly instance: string }
  | {
      readonly kind: 'command';
      readonly instance: string;
      readonly name: string;
    }
  | {
      readonly kind: 'worker';
      readonly instance: string;
      readonly name: string;
      /** The key an `each` Worker runs for. */
      readonly key?: string;
    }
  | { readonly kind: 'provide'; readonly instance: string }
  | {
      readonly kind: 'outside';
      /** Who Sent it, as code reaching the app from outside named itself. */
      readonly name?: string;
    }
  | { readonly kind: 'restore' };

/** A Message, the Instance it is for, who Sent it, and its Time. */
export interface Envelope {
  /** The ID of the Instance it is for. */
  readonly destination: string;
  readonly message: Tagged;
  readonly source: Source;
  readonly at: number;
}

// 1. Init
/** The app right after init: the root, named after its Actor, and every Child its State Invokes. */
export const init = (root: ActorDefinition, input?: unknown): Snapshot =>
  create(root, root.name, undefined, { input });
