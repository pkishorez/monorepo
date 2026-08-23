import { Context, Effect, Layer, Scope, Stream } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import {
  layerWebSocketProtocol,
  RpcConnection,
  type ConnectionStatus,
} from '@pkishorez/effect-cloudflare/websocket-rpc-client';
import type { BankWebHandler } from '../../server/index.ts';
import {
  BankRpcSerializationLayer,
  BankRpcs,
} from '../../rpc/contract/index.ts';

export type KeepSubscribed = <A, E, R>(
  subscribe: () => Stream.Stream<A, E, R>,
) => Stream.Stream<A, E, R>;

export interface BankConnection {
  readonly protocolLayer: Layer.Layer<RpcClient.Protocol>;
  readonly keepSubscribed: KeepSubscribed;
  readonly connectionStatus: Stream.Stream<ConnectionStatus> | null;
}

export const loopbackConnection = (
  handler: BankWebHandler,
  url: string,
): BankConnection => ({
  protocolLayer: RpcClient.layerProtocolHttp({ url }).pipe(
    Layer.provide([
      FetchHttpClient.layer.pipe(
        Layer.provide(
          Layer.succeed(FetchHttpClient.Fetch, ((input, init) =>
            handler(new Request(input, init))) as typeof globalThis.fetch),
        ),
      ),
      BankRpcSerializationLayer,
    ]),
  ),
  keepSubscribed: (subscribe) => subscribe(),
  connectionStatus: null,
});

export const webSocketConnection = (
  url: string,
): Effect.Effect<BankConnection, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      layerWebSocketProtocol({
        url,
        serialization: RpcSerialization.layerJson,
      }),
    );
    const connection = Context.get(context, RpcConnection);
    return {
      protocolLayer: Layer.succeed(
        RpcClient.Protocol,
        Context.get(context, RpcClient.Protocol),
      ),
      keepSubscribed: connection.keepSubscribed,
      connectionStatus: connection.connectionStatus,
    };
  });

const makeApi = (connection: BankConnection) =>
  RpcClient.make(BankRpcs).pipe(Effect.provide(connection.protocolLayer));

export type BankApi = Effect.Success<ReturnType<typeof makeApi>>;

export const connectBankApi = (
  connection: BankConnection,
): Effect.Effect<BankApi, never, Scope.Scope> => makeApi(connection);
