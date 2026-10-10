import type { Definition, Tagged } from '../actor/index.ts';
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
  /** A fixed Child by its name; keyed Children by their slot, in the Model's order. */
  readonly children: Readonly<
    Record<string, Instance | ReadonlyArray<Instance>>
  >;
  /** How many times this Instance has Invoked each Child, for the next ID. */
  readonly invoked: Readonly<Record<string, number>>;
}

/** The whole app: its root Instance. */
export type Snapshot = Instance;

/** A Message, the Instance it is for, and its Time. */
export interface Envelope {
  readonly instance: string;
  readonly message: Tagged;
  readonly at: number;
}

// 1. Init
/** The app right after init: the root, named after its Actor, and every Child its State Invokes. */
export const init = (root: Definition, input?: unknown): Snapshot =>
  create(root, root.name, undefined, input);
