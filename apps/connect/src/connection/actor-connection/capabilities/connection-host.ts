import { Context, type Duration, type Effect, type Scope } from 'effect';
import type {
  ConnectionStatus,
  PluginVersion,
  TunnelCheck,
} from '../../../cloud/contract/index.js';
import type { PluginState } from '@kestack/cli-platform/plugins/contract';

/*
 * What a Connection stands on outside itself, so it can be run against a
 * fake tunnel and a fake Cloud Connect: how often to beat, getting
 * cloudflared, opening a tunnel, checking one, sending a Report, and
 * signing in again, and how long to back off before that.
 */

/** How Cloud Connect took a Report. */
export type Reported =
  /** Taken: the version of each Plugin it wants run. */
  | {
      readonly _tag: 'Reported';
      readonly wanted: Readonly<Record<string, PluginVersion>>;
    }
  /** The Connection was forgotten (ADR 0016): sign out and stop. */
  | { readonly _tag: 'Forgotten' }
  /** The Sign-in is gone: stop serving until signed in again. */
  | { readonly _tag: 'SignedOut' }
  /** The Connection cannot go on, such as its id taken by another User. */
  | { readonly _tag: 'Refused'; readonly reason: string }
  /** It could not be sent; the next beat tries again. */
  | { readonly _tag: 'Unsent'; readonly problem: string };

export class ConnectionHost extends Context.Service<
  ConnectionHost,
  {
    /** How long between beats. */
    readonly every: Duration.Input;
    /** The cloudflared binary, downloaded first when it is missing; fails if it cannot be. */
    readonly cloudflared: Effect.Effect<string, unknown>;
    /** A new tunnel to `port` through the binary `cloudflared`, open for as long as the Scope: its URL, and an Effect that completes if it closes on its own. */
    readonly open: (
      port: number,
      cloudflared: string,
    ) => Effect.Effect<
      { readonly url: string; readonly closed: Effect.Effect<void> },
      unknown,
      Scope.Scope
    >;
    /** Whether the Connection answers at `url`. */
    readonly check: (url: string) => Effect.Effect<TunnelCheck>;
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
>()('@kestack/connect/ConnectionHost') {}
