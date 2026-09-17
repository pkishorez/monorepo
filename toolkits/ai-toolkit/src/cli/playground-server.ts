import { createServer } from 'node:http';
import { Duration, Layer } from 'effect';
import {
  HttpMiddleware,
  HttpRouter,
  HttpServerResponse,
} from 'effect/unstable/http';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import { NodeHttpServer, NodeServices } from '@effect/platform-node';
import { defaultBroadcaster } from 'std-toolkit/core';
import { Memory } from 'std-toolkit/db/memory';
import { AiPlaygroundServerRpc } from '../playground/contract/index.js';
import { AiPlaygroundRpcLive } from '../playground/live/index.js';
import { AiRpcLive } from '../rpc/live/index.js';
import { PLAYGROUND_HOST } from '../runtime/constants.js';
import { aiTable } from '../runtime/table/index.js';

/** Composition root: memory storage, the AI and Playground RPC, one HTTP server. */
export const makePlaygroundServer = (port: number) => {
  const storage = Layer.merge(Memory.make(aiTable).layer, defaultBroadcaster);
  const handlers = Layer.merge(AiRpcLive.layer(), AiPlaygroundRpcLive).pipe(
    Layer.provide(storage),
  );
  const openCors = HttpRouter.middleware(HttpMiddleware.cors(), {
    global: true,
  });
  const rpc = RpcServer.layerHttp({
    group: AiPlaygroundServerRpc,
    path: '/rpc',
  }).pipe(Layer.provide(handlers), Layer.provide(RpcSerialization.layerJson));
  const health = HttpRouter.add(
    'GET',
    '/health',
    HttpServerResponse.json({ ok: true }),
  );

  return HttpRouter.serve(Layer.mergeAll(rpc, health, openCors)).pipe(
    Layer.provide(
      NodeHttpServer.layer(createServer, {
        host: PLAYGROUND_HOST,
        port,
        gracefulShutdownTimeout: Duration.seconds(1),
      }),
    ),
    Layer.provide(NodeServices.layer),
  );
};
