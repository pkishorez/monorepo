import type { Effect } from 'effect';

export type PeerOperation<A> = Promise<A> | Effect.Effect<A, unknown>;

export interface PeerChannel {
  broadcast(message: unknown): PeerOperation<void>;
  subscribe(
    handler: (message: unknown) => void,
  ): PeerOperation<() => Promise<void>>;
}

export type PeerChannelFactory = (
  name: string,
) => PeerChannel | PeerOperation<PeerChannel>;
