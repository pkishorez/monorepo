import { Effect, Queue, Stream } from 'effect';

/*
 * How a write is heard: a ring on one BroadcastChannel, named for the
 * database it rings for, which every other channel of that name hears, in
 * this tab and in the browser's others. Without BroadcastChannel nothing
 * is heard, and only a reload reads again.
 */

export type Doorbell = {
  readonly ring: Effect.Effect<void>;
  readonly rings: Stream.Stream<void>;
};

/** The doorbell of one database, by its name. */
export const broadcast = (database: string): Doorbell => {
  if (typeof BroadcastChannel === 'undefined')
    return { ring: Effect.void, rings: Stream.never };
  return {
    ring: Effect.sync(() => {
      // Closed straight away: a posted message is still delivered.
      const channel = new BroadcastChannel(database);
      channel.postMessage(null);
      channel.close();
    }),
    rings: Stream.callback<void>(
      (queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const channel = new BroadcastChannel(database);
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
