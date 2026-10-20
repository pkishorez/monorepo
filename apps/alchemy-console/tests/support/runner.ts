import { Effect, Layer } from 'effect';
import { RpcClient, RpcSerialization } from 'effect/rpc';
import { Socket } from 'effect/socket';
import { RunnerApi } from '../../src/shared/contracts/runner-api/index.ts';

/*
 * A run's runner, played by a test: the RunnerApi over `/runner` with the
 * run's token, as the real runner speaks it from its container.
 */

/** The runner of the run `token` names, reaching Console at `consoleUrl`; `drop` cuts its socket as a network would. */
export const runnerAt = (consoleUrl: string, token: string) =>
  Effect.gen(function* () {
    const sockets: Array<WebSocket> = [];
    const protocol = yield* Layer.build(
      RpcClient.layerProtocolSocket({ retryTransientErrors: true }).pipe(
        Layer.provide([
          Socket.layerWebSocket(
            `${consoleUrl.replace(/^http/, 'ws')}/runner?token=${encodeURIComponent(token)}`,
          ).pipe(
            Layer.provide(
              Layer.succeed(Socket.WebSocketConstructor, (address) => {
                const ws = new globalThis.WebSocket(address);
                sockets.push(ws);
                return ws as never;
              }),
            ),
          ),
          RpcSerialization.layerJson,
        ]),
      ),
    );
    const client = yield* RpcClient.make(RunnerApi).pipe(
      Effect.provideContext(protocol),
    );
    return {
      client,
      /** Cuts the socket once it is open. */
      drop: Effect.gen(function* () {
        while (sockets.at(-1)?.readyState !== WebSocket.OPEN)
          yield* Effect.sleep('10 millis');
        sockets.at(-1)!.close(4001, 'dropped');
      }),
      /** How many sockets it has opened: one more after each drop. */
      opened: () => sockets.length,
    };
  });
