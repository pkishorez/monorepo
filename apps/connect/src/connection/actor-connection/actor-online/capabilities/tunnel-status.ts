import { Context, type Effect } from 'effect';

/*
 * How the tunnel tells the Connection online above it where it stands;
 * every change but losing it is Reported to Cloud Connect at once. Each carries the
 * tunnel's generation, so a word from a tunnel already replaced is dropped.
 */

export class TunnelStatus extends Context.Service<
  TunnelStatus,
  {
    /** A Request: getting cloudflared takes a while. */
    readonly installing: (generation: number) => Effect.Effect<void>;
    /** A Request: cloudflared is here, and the tunnel opening. */
    readonly opening: (generation: number) => Effect.Effect<void>;
    /** A Request: the tunnel could not open, at `at` in epoch ms. */
    readonly openFailed: (
      generation: number,
      at: number,
      problem: string,
    ) => Effect.Effect<void>;
    /** A Request: the tunnel is up at `url`. */
    readonly up: (generation: number, url: string) => Effect.Effect<void>;
    /** A Request: the tunnel is gone, and a new one is wanted. */
    readonly lost: (generation: number) => Effect.Effect<void>;
  }
>()('@kestack/connect/TunnelStatus') {}
