import { Context, type Duration, type Effect, type Scope } from 'effect';
import type { MachineStatus, TunnelCheck } from '../backend/contract/index.js';

/*
 * What the Heartbeat stands on, so it can be run against a fake tunnel and
 * a fake Backend: how often to beat, installing cloudflared, opening a
 * tunnel, checking one, sending a Report, and signing in again, and how long to back off before that.
 */

/** How the Backend took a Report. */
export type Reported =
  | { readonly _tag: 'Reported' }
  /** The Machine was forgotten (ADR 0016): sign out and stop. */
  | { readonly _tag: 'Forgotten' }
  /** The Sign-in is gone: stop serving until signed in again. */
  | { readonly _tag: 'SignedOut' }
  /** The Machine cannot go on, such as its id taken by another User. */
  | { readonly _tag: 'Refused'; readonly reason: string }
  /** It could not be sent; the next beat tries again. */
  | { readonly _tag: 'Unsent'; readonly problem: string };

export class HeartbeatHost extends Context.Service<
  HeartbeatHost,
  {
    /** How long between beats. */
    readonly every: Duration.Input;
    /** Whether cloudflared is on this computer already. */
    readonly installed: Effect.Effect<boolean>;
    /** Downloads cloudflared; fails if it cannot, or takes too long. */
    readonly install: Effect.Effect<void, unknown>;
    /** A new tunnel, open for as long as the Scope: its URL, and an Effect that completes if it closes on its own. */
    readonly open: Effect.Effect<
      { readonly url: string; readonly closed: Effect.Effect<void> },
      unknown,
      Scope.Scope
    >;
    /** Whether the server answers at `url`. */
    readonly check: (url: string) => Effect.Effect<TunnelCheck>;
    readonly report: (status: MachineStatus) => Effect.Effect<Reported>;
    /** The first wait before signing in again once a new Sign-in was refused too; it doubles after, up to a minute. */
    readonly backoff: Duration.Input;
    /** Signs in again, never with the Sign-in refused, after the Backend refused it; fails with why the Machine must stop. */
    readonly signInAgain: Effect.Effect<void, string>;
  }
>()('@kestack/ai-toolkit/HeartbeatHost') {}
