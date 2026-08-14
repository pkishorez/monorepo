import { createServer } from 'node:http';
import { Layer } from 'effect';
import { HttpRouter } from 'effect/unstable/http';
import {
  Rpc,
  RpcGroup,
  RpcSerialization,
  RpcServer,
} from 'effect/unstable/rpc';
import { NodeHttpServer, NodeServices } from '@effect/platform-node';
import { makeWhateverHandlers } from '@pkishorez/code';
import {
  WhateverRpcSerialization,
  WhateverRpcs,
} from '@pkishorez/code/contract';
import { makeTelemetryLayer } from '@pkishorez/effect-tracer/telemetry';

import { CorsMiddlewareLive } from './cors.ts';

type WhateverRpc = RpcGroup.Rpcs<typeof WhateverRpcs>;

const makeRpcRouteLive = (dbPath: string) =>
  (
    RpcServer.layerHttp<WhateverRpc>({
      group: WhateverRpcs,
      path: '/rpc',
      protocol: 'websocket',
    }) as Layer.Layer<
      never,
      never,
      | HttpRouter.HttpRouter
      | Rpc.ToHandler<WhateverRpc>
      | RpcSerialization.RpcSerialization
    >
  ).pipe(
    Layer.provide(makeWhateverHandlers({ dbPath })),
    Layer.provide(WhateverRpcSerialization),
  );

export const makeServerLive = (options: {
  host: string;
  port: number;
  db: string;
  telemetryUrl: string;
}) =>
  HttpRouter.serve(
    Layer.mergeAll(makeRpcRouteLive(options.db), CorsMiddlewareLive),
  ).pipe(
    Layer.provide(
      NodeHttpServer.layer(createServer, {
        host: options.host,
        port: options.port,
      }),
    ),
    Layer.provide(NodeServices.layer),
    Layer.provide(
      makeTelemetryLayer({
        endpoint: options.telemetryUrl,
        serviceName: 'whatever-code/backend',
        serviceVersion: '0.0.1',
      }),
    ),
  );
