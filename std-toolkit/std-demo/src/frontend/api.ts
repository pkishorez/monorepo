import { RpcClient, RpcSerialization } from '@effect/rpc';
import { Effect, Layer } from 'effect';
import { getBackendUrl } from 'alchemy/cloudflare/bun-spa';
import { FetchHttpClient } from '@effect/platform';
import { TodosRpc } from '../backend/domain';

export class ApiService extends Effect.Service<ApiService>()('ApiService', {
  effect: Effect.gen(function* () {
    const client = yield* RpcClient.make(TodosRpc).pipe(
      Effect.provide(
        RpcClient.layerProtocolHttp({ url: getBackendUrl().href }).pipe(
          Layer.provide([FetchHttpClient.layer, RpcSerialization.layerNdjson]),
        ),
      ),
    );

    return {
      client,
    };
  }),
}) {}
