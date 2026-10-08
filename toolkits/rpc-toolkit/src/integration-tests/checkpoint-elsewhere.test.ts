import { Effect, Option, Schema, Stream } from 'effect';
import { Rpc as EffectRpc, RpcClient, RpcGroup } from 'effect/rpc';
import { expect, it } from 'vitest';
import { Rpc } from '../rpc/index.ts';

const Group = RpcGroup.make(
  EffectRpc.make('feed', { success: Schema.Number, stream: true }),
);

it('a streaming handler using checkpoint also runs in-process, where it remembers nothing', async () => {
  const seen: Array<Option.Option<number>> = [];
  const handlers = Group.toLayer({
    feed: () =>
      Stream.unwrap(
        Effect.gen(function* () {
          const checkpoint = yield* Rpc.websocket.checkpoint(Schema.Number);
          seen.push(yield* checkpoint.get().pipe(Effect.orDie));
          yield* checkpoint.put(5).pipe(Effect.orDie);
          seen.push(yield* checkpoint.get().pipe(Effect.orDie));
          yield* checkpoint.clear;
          return Stream.make(1, 2);
        }),
      ),
  });

  const values = await Effect.runPromise(
    Effect.flatMap(RpcClient.make(Group), (client) =>
      Stream.runCollect(client.feed()),
    ).pipe(
      Effect.scoped,
      Effect.provide(Rpc.inProcess.client(Group, handlers)),
    ),
  );

  expect(values).toEqual([1, 2]);
  expect(seen).toEqual([Option.none(), Option.none()]);
});
