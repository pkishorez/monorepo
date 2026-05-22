import { Effect, ManagedRuntime, Layer } from 'effect';
import { RpcClient, RpcSerialization } from '@effect/rpc';
import { BrowserSocket } from '@effect/platform-browser';
import { AppRpcs } from '@/server/api';
import { FrontendTelemetryLayer } from './telemetry';

const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/rpc`;

export class CodeClient extends Effect.Service<CodeClient>()('CodeClient', {
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
}) {}

export const codeRuntime = ManagedRuntime.make(
  Layer.mergeAll(CodeClient.Default, FrontendTelemetryLayer),
);
