import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import { layerWebSocketProtocol } from 'rpc-toolkit/rpc/websocket-client';
import { Greeting } from '../../shared/rpc/greeting/index.ts';

const makeClient = RpcClient.make(Greeting);

export class Rpc extends Context.Service<
  Rpc,
  Effect.Success<typeof makeClient>
>()('__APP_NAME__/Rpc') {}

export const makeRpcRuntime = (url: string) =>
  ManagedRuntime.make(
    Layer.effect(Rpc, makeClient).pipe(
      Layer.provide(
        layerWebSocketProtocol({
          url,
          serialization: RpcSerialization.layerJson,
        }),
      ),
    ),
  );
