import { Context, type Duration, type Effect } from 'effect';
import type { PluginState } from '@kestack/cli-platform/plugins/contract';
import type {
  ConnectionStatus,
  PluginVersion,
} from '../../../../cloud/contract/index.js';

/*
 * Cloud Connect as a Connection online sees it, so it can be run against a
 * fake one: how often to beat, sending a Report, and signing in again, and
 * how long to back off before that.
 */

/** How Cloud Connect took a Report. */
export type Reported =
  /** Taken: the version of each Plugin it wants run. */
  | {
      readonly _tag: 'Reported';
      readonly wanted: Readonly<Record<string, PluginVersion>>;
    }
  /** Taken, but this `ke-connect` is below the Minimum Connect: stop. */
  | {
      readonly _tag: 'Outdated';
      readonly version: string;
      readonly minConnect: string;
    }
  /** The Connection was forgotten (ADR 0016): sign out and stop. */
  | { readonly _tag: 'Forgotten' }
  /** The Sign-in is gone: stop serving until signed in again. */
  | { readonly _tag: 'SignedOut' }
  /** The Connection cannot go on, such as its id taken by another User. */
  | { readonly _tag: 'Refused'; readonly reason: string }
  /** It could not be sent; the next beat tries again. */
  | { readonly _tag: 'Unsent'; readonly problem: string };

export class Cloud extends Context.Service<
  Cloud,
  {
    /** How long between beats. */
    readonly every: Duration.Input;
    /** Reports how the tunnel and each Plugin stand. */
    readonly report: (report: {
      readonly status: ConnectionStatus;
      readonly plugins: Readonly<Record<string, PluginState>>;
    }) => Effect.Effect<Reported>;
    /** The first wait before signing in again once a new Sign-in was refused too; it doubles after, up to a minute. */
    readonly backoff: Duration.Input;
    /** Signs in again, never with the Sign-in refused, after Cloud Connect refused it; fails with why the Connection must stop. */
    readonly signInAgain: Effect.Effect<void, string>;
  }
>()('@kestack/connect/Cloud') {}
