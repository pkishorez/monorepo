import { Effect, Layer, PubSub, Stream } from 'effect';
import type { Entity } from '../entity/index.js';
import { Broadcaster } from './broadcaster.js';

/**
 * A Broadcaster shared by every participant of this origin under `name`,
 * such as every tab writing to one IndexedDB database: each write is heard
 * where it was made and, through a BroadcastChannel, by every other
 * participant. Entities are plain data, so they cross as they are.
 */
export const sharedBroadcaster = (name: string): Layer.Layer<Broadcaster> =>
  Layer.effect(
    Broadcaster,
    Effect.gen(function* () {
      const pubsub = yield* PubSub.unbounded<Entity<any>>();
      const publish = (values: ReadonlyArray<Entity<any>>) => {
        for (const value of values) PubSub.publishUnsafe(pubsub, value);
      };
      const channel = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const opened = new BroadcastChannel(
            `std-toolkit/broadcaster/${name}`,
          );
          opened.onmessage = (event: MessageEvent<Entity<any>[]>) =>
            publish(event.data);
          return opened;
        }),
        (opened) => Effect.sync(() => opened.close()),
      );
      return {
        broadcast: (values) => {
          publish(values);
          channel.postMessage(values);
        },
        changes: Stream.fromPubSub(pubsub),
      };
    }),
  );
