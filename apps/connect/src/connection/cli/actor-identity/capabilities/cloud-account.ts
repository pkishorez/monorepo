import { Context, type Duration, type Effect } from 'effect';
import type { ConnectionStatus, Release } from '../../../../heartbeat/index.js';

/*
 * The User's account on Connect Cloud, which Identity stands on, so it can
 * be run against a fake one: signing in, signing in again, signing out, and
 * sending a Report with the Sign-in.
 */

/** Who the Connection is, once signed in. */
export interface Identified {
  readonly id: string;
}

/** How Connect Cloud took a Report. */
export type Reported =
  /** Taken: the Release of each Plugin to run. */
  | {
      readonly _tag: 'Reported';
      readonly wanted: Readonly<Record<string, Release>>;
    }
  /** This `ke-connect` is below the Minimum Connect, as Connect Cloud's one `line` says: stop. */
  | { readonly _tag: 'Outdated'; readonly line: string }
  /** The Connection was forgotten: sign out and stop. */
  | { readonly _tag: 'Forgotten' }
  /** Connect Cloud says the Sign-in is gone: the User is logged out. */
  | { readonly _tag: 'SignedOut' }
  /** The Connection cannot go on, such as its id taken by another User. */
  | { readonly _tag: 'Refused'; readonly reason: string }
  /** Nothing is known: it could not be sent, and the next Heartbeat tries again. */
  | { readonly _tag: 'Unsent'; readonly problem: string };

export class CloudAccount extends Context.Service<
  CloudAccount,
  {
    /** Signs in, with the Sign-in kept or a new one, and finds which Connection this is; fails with why it cannot go on. */
    readonly identify: Effect.Effect<Identified, string>;
    /** Signs in again, never with the Sign-in refused; fails with why the Connection must stop. */
    readonly signInAgain: Effect.Effect<void, string>;
    /** The first wait before signing in again once a new Sign-in was refused too; it doubles after, up to a minute. */
    readonly backoff: Duration.Input;
    /** How long between Heartbeats. */
    readonly every: Duration.Input;
    /** Reports where the tunnel stands and the Connection Key, once identified. */
    readonly report: (
      status: ConnectionStatus,
      key: string,
    ) => Effect.Effect<Reported>;
  }
>()('@kestack/connect/CloudAccount') {}
