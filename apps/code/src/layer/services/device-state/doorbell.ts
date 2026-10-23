import { Effect, Queue, Stream } from 'effect';

/*
 * How a write is heard: a ring on one BroadcastChannel, which every other
 * channel of that name hears, in this tab and in the browser's others.
 * Without BroadcastChannel nothing is heard, and only a reload reads again.
 */

const CHANNEL = 'code:device';

export type Doorbell = {
  readonly ring: Effect.Effect<void>;
  readonly rings: Stream.Stream<void>;
};

export const broadcast = (): Doorbell => {
  if (typeof BroadcastChannel === 'undefined')
    return { ring: Effect.void, rings: Stream.never };
  return {
    ring: Effect.sync(() => {
      // Closed straight away: a posted message is still delivered.
      const channel = new BroadcastChannel(CHANNEL);
      channel.postMessage(null);
      channel.close();
    }),
    rings: Stream.callback<void>(
      (queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const channel = new BroadcastChannel(CHANNEL);
            channel.onmessage = () => Queue.offerUnsafe(queue, undefined);
            return channel;
          }),
          (channel) => Effect.sync(() => channel.close()),
        ),
      // Rings that arrive while a reader is busy fold into one read.
      { bufferSize: 1, strategy: 'sliding' },
    ),
  };
};
