import type { Tagged } from '../../actor/index.ts';
import type { Address } from '../address/index.ts';

/**
 * Who Sent a Message: the Instance, and what in it Sent: its View, a Command
 * by its name, a Worker by its name and key, or what it Provides. Only a
 * Capability's function Sends from another Instance than the one it is for,
 * and an Emit comes from the Child that Emitted it. A Message from outside
 * the tree, by a test, a tool or the server the app runs on, comes from no
 * Instance, named by whoever Sent it.
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
    };

/** One Message as it is played: who it is for, who Sent it, and its Time. */
export interface Entry {
  readonly to: Address;
  readonly message: Tagged;
  readonly from: From;
  /** The app's Time when it was Sent, in milliseconds. */
  readonly at: number;
}
