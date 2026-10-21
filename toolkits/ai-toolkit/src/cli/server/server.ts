import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { Duration, Layer } from 'effect';
import { HttpMiddleware, HttpRouter, HttpServerResponse } from 'effect/http';
import { RpcSerialization, RpcServer } from 'effect/rpc';
import { NodeHttpServer } from '@effect/platform-node';
import { AiApi } from '../../api/contract/index.js';
import { AiApiLive, Models } from '../../api/live/index.js';
import { Engine } from '../../engine/index.js';
import type { Harnesses, Titler } from '../../harness/index.js';
import { Store } from '../../store/index.js';

/*
 * The whole server as one Layer: the Store on its SQLite file, the engine
 * over it and the harnesses, and the API at `/rpc` over WebSocket, open to
 * any origin. It runs until its Scope closes; then the engine stops every
 * turn, and the Store closes last.
 */

export interface ServerOptions {
  readonly port: number;
  readonly host?: string;
  /** The SQLite file; the models.dev copy is kept beside it. */
  readonly db: string;
  readonly harnesses: Layer.Layer<Harnesses | Titler>;
}

export const server = (options: ServerOptions) => {
  const base = Layer.merge(Store.layer(options.db), options.harnesses);
  const engine = Engine.layer.pipe(Layer.provide(base));
  const models = Models.layer({
    cacheFile: join(dirname(options.db), 'models.json'),
  });
  const handlers = AiApiLive.pipe(
    Layer.provide(Layer.mergeAll(base, engine, models)),
  );
  const rpc = RpcServer.layerHttp({
    group: AiApi,
    path: '/rpc',
    protocol: 'websocket',
  }).pipe(Layer.provide(handlers), Layer.provide(RpcSerialization.layerJson));
  const cors = HttpRouter.middleware(HttpMiddleware.cors(), { global: true });
  const health = HttpRouter.add(
    'GET',
    '/health',
    HttpServerResponse.json({ ok: true }),
  );
  return HttpRouter.serve(Layer.mergeAll(rpc, cors, health)).pipe(
    Layer.provide(
      NodeHttpServer.layer(createServer, {
        port: options.port,
        host: options.host ?? '127.0.0.1',
        gracefulShutdownTimeout: Duration.seconds(1),
      }),
    ),
  );
};
