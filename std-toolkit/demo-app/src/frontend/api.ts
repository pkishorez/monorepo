import { RpcClient, RpcSerialization } from '@effect/rpc';
import { Effect, Layer, Scope } from 'effect';
import { FetchHttpClient } from '@effect/platform';
import { TodosRpc } from '../backend/domain';

export class ApiService extends Effect.Service<ApiService>()('ApiService', {
  effect: Effect.gen(function* () {
    const scope = yield* Scope.make();
    const client = yield* RpcClient.make(TodosRpc).pipe(
      Effect.provide(
        RpcClient.layerProtocolHttp({ url: '/api' }).pipe(
          Layer.provide([FetchHttpClient.layer, RpcSerialization.layerNdjson]),
        ),
      ),
      Scope.extend(scope),
    );

    return {
      client,
    };
  }),
}) {}
