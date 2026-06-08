import { createServer } from 'node:http';
import { Effect, Layer } from 'effect';
import { HttpMiddleware, HttpRouter } from 'effect/unstable/http';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import {
  NodeHttpServer,
  NodeRuntime,
  NodeServices,
} from '@effect/platform-node';
import { DevtoolsRpc } from '../rpc/index.js';
import { DevtoolsHandlersLive } from './handlers.js';

const HOST = process.env.DEVTOOLS_HOST ?? '127.0.0.1';
const PORT = process.env.DEVTOOLS_PORT
  ? Number.parseInt(process.env.DEVTOOLS_PORT, 10)
  : 14400;

const RpcRouteLive = RpcServer.layerHttp({
  group: DevtoolsRpc,
  path: '/rpc',
  protocol: 'http',
}).pipe(
  Layer.provide(DevtoolsHandlersLive),
  Layer.provide(RpcSerialization.layerNdjson),
);

const ServerLive = HttpRouter.serve(RpcRouteLive, {
  middleware: (app) => HttpMiddleware.cors()(app),
}).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { host: HOST, port: PORT })),
  Layer.provide(NodeServices.layer),
);

const program = Effect.gen(function* () {
  yield* Effect.log(
    `devtools RPC server listening on http://${HOST}:${PORT}/rpc`,
  );
  yield* Effect.never;
}).pipe(Effect.provide(ServerLive));

NodeRuntime.runMain(program);
