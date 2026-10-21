import { Effect, Queue, Stream } from 'effect';
import type { Doorbell } from '../contract/index.js';

type BroadcastChannelLike = {
  postMessage(message: unknown): void;
  addEventListener(
    type: 'message',
    listener: (event: { data: unknown }) => void,
  ): void;
  removeEventListener(
    type: 'message',
    listener: (event: { data: unknown }) => void,
  ): void;
  close(): void;
};

export type BroadcastChannelConstructor = new (
  name: string,
) => BroadcastChannelLike;

const CHANNEL = 'replica';

// One channel carries every topic; a message is the topic that changed. A
// tab hears its own rings too, which costs it one empty read.
export const broadcastChannelDoorbell = (
  Channel: BroadcastChannelConstructor,
): Doorbell => ({
  ring: (topic) =>
    Effect.sync(() => {
      // Closed straight away: a posted message is still delivered, and an
      // open channel keeps a Node process alive.
      const channel = new Channel(CHANNEL);
      channel.postMessage(topic);
      channel.close();
    }),
  listen: (topic) =>
    Stream.callback<void>(
      (queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const channel = new Channel(CHANNEL);
            const listener = (event: { data: unknown }) => {
              if (event.data === topic) Queue.offerUnsafe(queue, undefined);
            };
            channel.addEventListener('message', listener);
            return { channel, listener };
          }),
          ({ channel, listener }) =>
            Effect.sync(() => {
              channel.removeEventListener('message', listener);
              channel.close();
            }),
        ),
      // Rings that arrive while a listener is busy fold into one read.
      { bufferSize: 1, strategy: 'sliding' },
    ),
});
