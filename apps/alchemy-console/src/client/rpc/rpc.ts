import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import { FetchHttpClient } from 'effect/unstable/http';
import { Greeting } from '../../shared/rpc/greeting/index.ts';

import { StateStores } from '../../server/rpc/state-stores/index.ts';

const makeClient = RpcClient.make(Greeting.merge(StateStores));

export class Rpc extends Context.Service<
  Rpc,
  Effect.Success<typeof makeClient>
>()('alchemy-console/Rpc') {}

export const makeRpcRuntime = (url: string) =>
  ManagedRuntime.make(
    Layer.effect(Rpc, makeClient).pipe(
      Layer.provide(
        RpcClient.layerProtocolHttp({ url }).pipe(
          Layer.provide([FetchHttpClient.layer, RpcSerialization.layerJson]),
        ),
      ),
    ),
  );
