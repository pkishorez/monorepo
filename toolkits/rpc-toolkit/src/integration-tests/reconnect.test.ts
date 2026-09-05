import { Effect, Fiber, Layer, Schema, Stream } from 'effect';
import { Headers } from 'effect/unstable/http';
import { Rpc, RpcGroup, RpcTest } from 'effect/unstable/rpc';
import { expect, it, vi } from 'vitest';
import { Cannotation } from '../rpc/cannotation/index.js';
import { InvocationKind } from '../rpc/invocation/index.js';
import { makeRpcConnection } from '../rpc/websocket-client/websocket-client.js';

it('runs client Cannotation again with current credentials when a subscription restarts', async () => {
  const Credentials = Cannotation.make<boolean>()('reconnect/Credentials', {
    client: true,
  });
  const Group = Credentials.with(true)(
    RpcGroup.make(Rpc.make('watch', { success: Schema.Number, stream: true })),
  );
  let token = 'first-token';
  const calls: Array<{ token: string | undefined; kind: string }> = [];
  const connection = await Effect.runPromise(makeRpcConnection);
  await Effect.runPromise(connection.hooks.onConnect);
  const layers = Layer.mergeAll(
    Group.toLayer({ watch: () => Stream.never }),
    Credentials.layer(({ headers }) =>
      Effect.gen(function* () {
        calls.push({
          token: headers.authorization,
          kind: yield* InvocationKind,
        });
      }),
    ),
    Credentials.clientLayer(({ request, next }) =>
      next({
        ...request,
        headers: Headers.fromInput({ authorization: token }),
      }),
    ),
  );
  const fiber = Effect.runFork(
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(Group);
      yield* connection
        .keepSubscribed(() => client.watch())
        .pipe(Stream.runDrain);
    }).pipe(Effect.provide(layers), Effect.scoped),
  );
  try {
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await Effect.runPromise(connection.hooks.onDisconnect);
    token = 'refreshed-token';
    await Effect.runPromise(connection.hooks.onConnect);
    await vi.waitFor(() =>
      expect(calls).toEqual([
        { token: 'first-token', kind: 'fresh' },
        { token: 'refreshed-token', kind: 'fresh' },
      ]),
    );
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber));
  }
  await Effect.runPromise(connection.hooks.onDisconnect);
  await Effect.runPromise(connection.hooks.onConnect);
  expect(calls).toHaveLength(2);
});
