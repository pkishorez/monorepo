import { Context, Effect, Layer, Scope, Stream } from 'effect';
import { FetchHttpClient, HttpEffect } from 'effect/unstable/http';
import { RpcClient, RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import {
  layerWebSocketProtocol,
  RpcConnection,
  type ConnectionStatus,
} from '@pkishorez/effect-cloudflare/websocket-rpc-client';
import { defaultBroadcaster } from 'std-toolkit/core';
import type { StdTableService } from 'std-toolkit/db';
import { BankMutationsLive } from '../mutations/index.ts';
import type { BankSubscriptionsLive as InMemorySubscriptionsLive } from '../subscriptions/in-memory/index.ts';
import { BankRpcSerializationLayer, BankRpcs } from '../contract/index.ts';

type BankTableLayer = Layer.Layer<StdTableService<'bank'>>;
type SubscriptionsLayer = typeof InMemorySubscriptionsLive;

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const makeBankFetch = (
  table: BankTableLayer,
  subscriptions: SubscriptionsLayer,
): ((request: Request) => Promise<Response>) => {
  const services = Layer.mergeAll(
    Layer.mergeAll(BankMutationsLive, subscriptions).pipe(
      Layer.provide(Layer.merge(table, defaultBroadcaster)),
    ),
    BankRpcSerializationLayer,
  );
  const booting = Effect.runPromise(
    RpcServer.toHttpEffect(BankRpcs).pipe(
      Effect.provide(services),
      Effect.provideService(Scope.Scope, Scope.makeUnsafe()),
    ),
  ).then((httpEffect) => HttpEffect.toWebHandler(httpEffect));
  return async (request) => (await booting)(request);
};

export const loopbackProtocol = (
  table: BankTableLayer,
  subscriptions: SubscriptionsLayer,
  url: string,
): Layer.Layer<RpcClient.Protocol> => {
  const handle = makeBankFetch(table, subscriptions);
  const fetchImpl: FetchLike = (input, init) =>
    handle(new Request(input, init));
  return RpcClient.layerProtocolHttp({ url }).pipe(
    Layer.provide([
      FetchHttpClient.layer.pipe(
        Layer.provide(
          Layer.succeed(
            FetchHttpClient.Fetch,
            fetchImpl as typeof globalThis.fetch,
          ),
        ),
      ),
      BankRpcSerializationLayer,
    ]),
  );
};

export interface DurableObjectProtocol {
  readonly protocolLayer: Layer.Layer<RpcClient.Protocol>;
  readonly keepSubscribed: <A, E, R>(
    subscribe: () => Stream.Stream<A, E, R>,
  ) => Stream.Stream<A, E, R>;
  readonly connectionStatus: Stream.Stream<ConnectionStatus>;
}

export const durableObjectProtocol = (
  url: string,
): Effect.Effect<DurableObjectProtocol, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    const protocolLayer = layerWebSocketProtocol({
      url,
      serialization: RpcSerialization.layerJson,
    });
    const context = yield* Layer.build(protocolLayer);
    const connection = Context.get(context, RpcConnection);
    const protocol = Context.get(context, RpcClient.Protocol);
    return {
      protocolLayer: Layer.succeed(RpcClient.Protocol, protocol),
      keepSubscribed: connection.keepSubscribed,
      connectionStatus: connection.connectionStatus,
    };
  });
