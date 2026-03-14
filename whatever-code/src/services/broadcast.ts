import { BroadcastSchema } from "@std-toolkit/core";
import { Effect, PubSub, Stream } from "effect";

export class BroadcastService extends Effect.Service<BroadcastService>()(
  "BroadcastService",
  {
    effect: Effect.gen(function* () {
      const pubsub = yield* PubSub.unbounded<typeof BroadcastSchema.Type>();
      const subscribe = Stream.unwrapScoped(
        Effect.map(PubSub.subscribe(pubsub), Stream.fromQueue),
      );

      const publish = (value: typeof BroadcastSchema.Type) =>
        PubSub.publish(pubsub, value);

      return { subscribe, publish };
    }),
  },
) {}
