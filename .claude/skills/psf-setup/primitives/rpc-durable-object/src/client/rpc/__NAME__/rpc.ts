import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import { layerWebSocketProtocol } from 'rpc-toolkit/rpc/websocket-client';
import { Greeting } from '../../../shared/rpc/greeting/index.ts';

const makeClient = RpcClient.make(Greeting);

export class __Name__Rpc extends Context.Service<
  __Name__Rpc,
  Effect.Success<typeof makeClient>
>()('__APP_NAME__/__Name__Rpc') {}

export const make__Name__RpcRuntime = (url: string) =>
  ManagedRuntime.make(
    Layer.effect(__Name__Rpc, makeClient).pipe(
      Layer.provide(
        layerWebSocketProtocol({
          url,
          serialization: RpcSerialization.layerJson,
        }),
      ),
    ),
  );
