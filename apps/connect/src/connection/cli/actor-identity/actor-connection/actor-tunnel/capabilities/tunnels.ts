import { Context, type Duration, type Effect, type Scope } from 'effect';
import type { TunnelCheck } from '../../../../../../contract/index.js';

/*
 * The tunnel a Connection is reached through, so it can be run against a
 * fake one: getting cloudflared, how often to say how far that has come,
 * opening a tunnel, and checking one.
 */

export class Tunnels extends Context.Service<
  Tunnels,
  {
    /** The cloudflared binary, downloaded first when it is missing, telling `received` the bytes so far; fails if it cannot be. */
    readonly cloudflared: (
      received: (bytes: number) => Effect.Effect<void>,
    ) => Effect.Effect<string, unknown>;
    /** How often a download is said to have come further. */
    readonly downloadEvery: Duration.Input;
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
  }
>()('@kestack/connect/Tunnels') {}
