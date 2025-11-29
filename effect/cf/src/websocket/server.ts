import { RpcServer, RpcSerialization, RpcGroup, Rpc } from '@effect/rpc';
import { Effect, Deferred } from 'effect';

export const executeRpc = <Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  message: string,
  send: (msg: string) => void,
) =>
  Effect.gen(function* () {
    // 1. Create a Deferred to hold the final result
    const deferred = yield* Deferred.make<string, never>();
    const serialization = yield* RpcSerialization.RpcSerialization;
    const parser = serialization.unsafeMake();

    // 2. Create the Server without any transport layer
    const server = yield* RpcServer.makeNoSerialization(group, {
      // This callback is triggered when the handler returns a response
      concurrency: 'unbounded',
      disableClientAcks: true,
      disableTracing: false,
      disableSpanPropagation: true,
      onFromServer: Effect.fn(function* (msg) {
        send(parser.encode(msg) as string);

        if (msg._tag === 'Exit' || msg._tag === 'Defect') {
          yield* Deferred.succeed(deferred, 'done');
        }
      }),
    });

    const data = parser.decode(message);
    if (data.length !== 1) {
      return yield* Effect.logError('Expects a single message');
    }
    yield* server.write(1, data[0] as any);

    // 4. Wait for the response
    yield* Deferred.await(deferred);
    // yield* server.disconnect(1);
  }).pipe(
    // The server requires a scope to manage its lifecycle
    Effect.scoped,
    Effect.provide(RpcSerialization.layerJson),
  );
