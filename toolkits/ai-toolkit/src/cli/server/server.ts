import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Duration, Effect, Layer } from 'effect';
import {
  HttpMiddleware,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';
import { RpcSerialization, RpcServer } from 'effect/rpc';
import { NodeHttpServer } from '@effect/platform-node';
import { AiApi } from '../../api/contract/index.js';
import { AiApiLive, Models } from '../../api/live/index.js';
import { Engine, storedHarnessBinaries } from '../../engine/index.js';
import { Folders } from '../../folders/index.js';
import type { Harnesses, Titler } from '../../harness/index.js';
import { Store } from '../../store/index.js';
import { keyGuard, selectProtocol } from './machine-key.js';
import { allowsOrigin } from './origins.js';

/*
 * The whole server as one Layer: the Store on its SQLite file, the engine
 * over it and the harnesses, Attachments saved beside it, Folders under the
 * home folder, and the API at `/rpc` over WebSocket. A browser page is
 * served only from an origin given (see origins.ts); a request from any
 * other gets 403. Given a Machine Key, `/rpc` also asks every caller for it
 * (see machine-key.ts). It runs until its Scope closes; then the engine
 * stops every turn, and the Store closes last.
 */

/** This machine, and the app's own address as portless serves it in development. */
export const DEFAULT_ORIGINS: ReadonlyArray<string> = [
  'http://localhost:*',
  'http://127.0.0.1:*',
  'http://[::1]:*',
  'https://localhost:*',
  'https://*.localhost:*',
  'https://code.kishore.computer',
  'https://*.code.kishore.computer',
  'https://code.kishore.app',
];

export interface ServerOptions {
  readonly port: number;
  readonly host?: string;
  /** The SQLite file; the models.dev copy is kept beside it. */
  readonly db: string;
  /** Where Attachments that are not images are saved; beside the database unless given. */
  readonly attachments?: string;
  readonly harnesses: Layer.Layer<Harnesses | Titler>;
  /** The folder `listFolder` and `createFolder` never leave; the user's home unless given. */
  readonly home?: string;
  /**
   * The origins a browser page may call from, each `scheme://host[:port]`
   * with `*.` for any subdomains and `:*` for any port; DEFAULT_ORIGINS
   * unless given. A request without an Origin is not from a page and is let in.
   */
  readonly origins?: ReadonlyArray<string>;
  /**
   * The Machine Key (ADR 0015): when given, a WebSocket to `/rpc` must offer
   * the subprotocol `key.<key>`, page or not; `/health` stays open.
   */
  readonly key?: string | undefined;
}

/** Turns away any request from a page whose origin is not allowed. */
const originGuard = (allowed: (origin: string) => boolean) =>
  HttpRouter.middleware(
    (app) =>
      Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) => {
        const origin = request.headers['origin'];
        return origin === undefined || allowed(origin)
          ? app
          : Effect.succeed(
              HttpServerResponse.text('This origin is not allowed', {
                status: 403,
              }),
            );
      }),
    { global: true },
  );

export const server = (options: ServerOptions) => {
  const base = Layer.merge(Store.layer(options.db), options.harnesses);
  const engine = Engine.layer({
    attachments:
      options.attachments ?? join(dirname(options.db), 'attachments'),
  }).pipe(Layer.provide(base));
  const models = Models.layer({
    cacheFile: join(dirname(options.db), 'models.json'),
  }).pipe(Layer.provide(storedHarnessBinaries), Layer.provide(base));
  const folders = Folders.layer({ home: options.home ?? homedir() });
  const handlers = AiApiLive.pipe(
    Layer.provide(Layer.mergeAll(base, engine, models, folders)),
  );
  const allowed = allowsOrigin(options.origins ?? DEFAULT_ORIGINS);
  const rpc = RpcServer.layerHttp({
    group: AiApi,
    path: '/rpc',
    protocol: 'websocket',
  }).pipe(Layer.provide(handlers), Layer.provide(RpcSerialization.layerJson));
  const cors = HttpRouter.middleware(
    HttpMiddleware.cors({ allowedOrigins: allowed }),
    { global: true },
  );
  const health = HttpRouter.add(
    'GET',
    '/health',
    HttpServerResponse.json({ ok: true }),
  );
  const guards =
    options.key === undefined
      ? originGuard(allowed)
      : Layer.merge(originGuard(allowed), keyGuard(options.key));
  return HttpRouter.serve(Layer.mergeAll(rpc, cors, guards, health)).pipe(
    Layer.provide(
      NodeHttpServer.layer(createServer, {
        port: options.port,
        host: options.host ?? '127.0.0.1',
        gracefulShutdownTimeout: Duration.seconds(1),
        websocket: { handleProtocols: selectProtocol },
      }),
    ),
  );
};
