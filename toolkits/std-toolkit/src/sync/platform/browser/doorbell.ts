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

const CHANNEL = 'std-sync';

/**
 * Posts one ring. The channel closes straight away, since a message is
 * delivered once posted and an open channel keeps a Node process alive.
 */
export const ringOnce = (
  Channel: BroadcastChannelConstructor,
  topic: string,
): void => {
  const channel = new Channel(CHANNEL);
  channel.postMessage(topic);
  channel.close();
};

// One channel name carries every topic; a message is the topic that changed.
// The ringing tab hears its own ring too, which costs it one empty re-read.
export const broadcastChannelDoorbell = (
  Channel: BroadcastChannelConstructor,
): Doorbell => ({
  ring: (topic) => Effect.sync(() => ringOnce(Channel, topic)),
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
      // Rings that arrive while a listener is busy fold into one re-read.
      { bufferSize: 1, strategy: 'sliding' },
    ),
});
