import { Context, Effect, ManagedRuntime, Layer } from 'effect';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import { BrowserSocket } from '@effect/platform-browser';
import { AppRpcs } from '@/server/rpcs';

const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/rpc`;

export class FinancesClient extends Context.Service<FinancesClient>()(
  'FinancesClient',
  {
    make: Effect.gen(function* () {
      const client = yield* RpcClient.make(AppRpcs);
      return { client };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(
      RpcClient.layerProtocolSocket().pipe(
        Layer.provide(RpcSerialization.layerNdjson),
        Layer.provide(BrowserSocket.layerWebSocket(wsUrl)),
      ),
    ),
  );
}

export const financesRuntime = ManagedRuntime.make(FinancesClient.layer);
