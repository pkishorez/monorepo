import { RpcClient, RpcSerialization } from '@effect/rpc';
import { Duration, Effect, Layer, Ref, Scope } from 'effect';
import { FetchHttpClient, HttpClient } from '@effect/platform';
import { TodosRpc } from '../backend/domain';

export class ApiService extends Effect.Service<ApiService>()('ApiService', {
  effect: Effect.gen(function* () {
    const scope = yield* Scope.make();
    const delayRef = yield* Ref.make(0);

    const delayedHttpClientLayer = Layer.unwrapEffect(
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const delayedClient = client.pipe(
          HttpClient.mapRequestEffect((req) =>
            Effect.gen(function* () {
              const value = yield* delayRef.get;
              yield* Effect.sleep(Duration.millis(value));
              return req;
            }),
          ),
        );
        return Layer.succeed(HttpClient.HttpClient, delayedClient);
      }),
    ).pipe(Layer.provide(FetchHttpClient.layer));
    const client = yield* RpcClient.make(TodosRpc).pipe(
      Effect.provide([
        RpcClient.layerProtocolHttp({ url: '/api' }).pipe(
          Layer.provide([delayedHttpClientLayer, RpcSerialization.layerNdjson]),
        ),
      ]),
      Scope.extend(scope),
    );

    return {
      client,
      delayRef,
    };
  }),
}) {}
