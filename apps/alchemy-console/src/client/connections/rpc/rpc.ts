import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import { FetchHttpClient } from 'effect/unstable/http';

import { ConsoleApi } from '../../../shared/api/console-api/index.ts';
import { telemetryLayer } from '../../telemetry/index.ts';

const makeClient = RpcClient.make(ConsoleApi);

export class Rpc extends Context.Service<
  Rpc,
  Effect.Success<typeof makeClient>
>()('alchemy-console/Rpc') {}

export const makeRpcRuntime = (url: string) =>
  ManagedRuntime.make(
    Layer.effect(Rpc, makeClient).pipe(
      Layer.provide(
        RpcClient.layerProtocolHttp({ url }).pipe(
          Layer.provide([FetchHttpClient.layer, RpcSerialization.layerNdjson]),
        ),
      ),
      Layer.provideMerge(telemetryLayer()),
    ),
  );
