import { createServer } from 'node:http';
import { Duration, Effect, Layer } from 'effect';
import {
  HttpMiddleware,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';
import {
  type Rpc,
  type RpcGroup,
  RpcSerialization,
  RpcServer,
} from 'effect/rpc';
import { NodeHttpServer } from '@effect/platform-node';
import { allowsOrigin } from '../../cloud/contract/index.js';
import { keyGuard, selectProtocol } from './machine-key.js';

/*
 * The Machine's one socket: every App Group's API at `/rpc` over
 * WebSocket, merged into one group, so a caller reaches every procedure by
 * its own name, unique across App Groups (ai-toolkit ADR 0004). A browser
 * page is served only from an origin given; a request from any other gets
 * 403. Given a Machine Key, every request but `/health` must also carry it
 * (see machine-key.ts). It runs until its Scope closes; then each App
 * Group's Layer closes.
 */

/** This machine, and every App on the stack's domains, deployed or as Portless serves it in development. */
export const DEFAULT_ORIGINS: ReadonlyArray<string> = [
  'http://localhost:*',
  'http://127.0.0.1:*',
  'http://[::1]:*',
  'https://localhost:*',
  'https://*.localhost:*',
  'https://*.kishore.app',
  'https://*.kishore.computer',
];

/** What a Machine serves for one App: its API, and the Layer of its handlers. */
export interface AppGroup<Rpcs extends Rpc.Any, E> {
  readonly api: RpcGroup.RpcGroup<Rpcs>;
  readonly layer: Layer.Layer<Rpc.ToHandler<Rpcs>, E>;
}

export interface ServerOptions<Rpcs extends Rpc.Any, E> {
  readonly port: number;
  readonly host?: string;
  /** Every App Group this Machine serves; at least one. */
  readonly groups: readonly [AppGroup<Rpcs, E>, ...Array<AppGroup<Rpcs, E>>];
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

export const server = <Rpcs extends Rpc.Any, E>(
  options: ServerOptions<Rpcs, E>,
) => {
  const [first, ...rest] = options.groups;
  const group = first.api.merge(...rest.map(({ api }) => api));
  const handlers = rest.reduce<Layer.Layer<Rpc.ToHandler<Rpcs>, E>>(
    (all, { layer }) => Layer.merge(all, layer),
    first.layer,
  );
  const allowed = allowsOrigin(options.origins ?? DEFAULT_ORIGINS);
  const rpc = RpcServer.layerHttp({
    group,
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
  // The HttpServer stays in the output, so a caller that bound port 0 can
  // read the port it got from its address.
  return HttpRouter.serve(Layer.mergeAll(rpc, cors, guards, health)).pipe(
    Layer.provideMerge(
      NodeHttpServer.layer(createServer, {
        port: options.port,
        host: options.host ?? '127.0.0.1',
        gracefulShutdownTimeout: Duration.seconds(1),
        websocket: { handleProtocols: selectProtocol },
      }),
    ),
  );
};
