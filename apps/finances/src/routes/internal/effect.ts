import { Effect, ManagedRuntime, Layer } from 'effect';
import { RpcClient, RpcSerialization } from '@effect/rpc';
import { BrowserSocket } from '@effect/platform-browser';
import { AppRpcs } from '@/server/rpcs';

const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/rpc`;

export class FinancesClient extends Effect.Service<FinancesClient>()(
  'FinancesClient',
  {
    scoped: Effect.gen(function* () {
      const client = yield* RpcClient.make(AppRpcs);
      return { client };
    }),
    dependencies: [
      RpcClient.layerProtocolSocket().pipe(
        Layer.provide(RpcSerialization.layerNdjson),
        Layer.provide(BrowserSocket.layerWebSocket(wsUrl)),
      ),
    ],
  },
) {}

export const financesRuntime = ManagedRuntime.make(FinancesClient.Default);
