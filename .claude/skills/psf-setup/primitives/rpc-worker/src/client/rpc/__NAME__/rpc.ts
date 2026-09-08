import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
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
        RpcClient.layerProtocolHttp({ url }).pipe(
          Layer.provide([FetchHttpClient.layer, RpcSerialization.layerJson]),
        ),
      ),
    ),
  );
