import { Effect } from 'effect';
import type {
  PeerChannel,
  PeerChannelFactory,
  PeerOperation,
} from '../../domain/peer-channel/index.js';
import type { EffectRunner } from '../effect-runner/index.js';

export type ChannelPhase =
  | 'channel-creation'
  | 'subscription'
  | 'send'
  | 'cleanup';

export type OpenChannel = {
  readonly broadcast: (message: unknown) => Promise<void>;
  readonly close: () => Promise<void>;
};

const run = <A, R>(
  operation: A | PeerOperation<A>,
  runner: EffectRunner<R>,
): Promise<A> =>
  Effect.isEffect(operation)
    ? runner.runPromise(operation as Effect.Effect<A, unknown, R>)
    : Promise.resolve(operation as A | Promise<A>);

// Opens a Platform channel lazily and swallows transport failures into
// onError: the channel is best-effort, never a source of truth.
export const openPeerChannel = <R>(args: {
  name: string;
  factory: PeerChannelFactory | null;
  runner: EffectRunner<R>;
  onMessage: (message: unknown) => void;
  onError: (phase: ChannelPhase, cause: unknown) => Promise<void>;
}): OpenChannel => {
  let accepting = true;
  let unsubscribe: (() => Promise<void>) | null = null;

  const ready: Promise<PeerChannel | null> = (async () => {
    if (args.factory === null) return null;
    let channel: PeerChannel;
    try {
      channel = await run(args.factory(args.name), args.runner);
    } catch (cause) {
      await args.onError('channel-creation', cause);
      return null;
    }
    try {
      unsubscribe = await run(
        channel.subscribe((message) => {
          if (accepting) args.onMessage(message);
        }),
        args.runner,
      );
    } catch (cause) {
      await args.onError('subscription', cause);
      return null;
    }
    return channel;
  })();

  return {
    broadcast: async (message) => {
      const channel = await ready;
      if (channel === null || !accepting) return;
      try {
        await run(channel.broadcast(message), args.runner);
      } catch (cause) {
        await args.onError('send', cause);
      }
    },
    close: async () => {
      accepting = false;
      await ready;
      if (unsubscribe === null) return;
      try {
        await unsubscribe();
      } catch (cause) {
        await args.onError('cleanup', cause);
      }
    },
  };
};
