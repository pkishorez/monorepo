import { Effect, Layer, PubSub, Stream } from 'effect';
import type { DecodedEntity } from '../entity-schema/index.js';
import { Broadcaster } from './broadcaster.js';

export const defaultBroadcaster: Layer.Layer<Broadcaster> = Layer.effect(
  Broadcaster,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<DecodedEntity<any>>();
    return {
      broadcast: (values) => {
        for (const value of values) PubSub.publishUnsafe(pubsub, value);
      },
      changes: Stream.fromPubSub(pubsub),
    };
  }),
);
