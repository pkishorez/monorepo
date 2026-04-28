import {
  HttpLayerRouter,
  HttpServerRequest,
  HttpServerResponse,
} from '@effect/platform';
import { RpcSerialization, RpcServer } from '@effect/rpc';
import { Effect, Layer, Option } from 'effect';
import { ApiRpcs } from '../api/definitions/index.js';
import { ApiHandlers } from '../api/handlers/index.js';
import { OTEL_BASE_URL } from '../constants.js';

export function buildRpcRoute() {
  return RpcServer.layerHttpRouter({
    group: ApiRpcs,
    path: '/api',
    protocol: 'websocket',
  }).pipe(
    Layer.provide(ApiHandlers),
    Layer.provide(RpcSerialization.layerNdjson),
  );
}

export function buildProxyRoute(proxyTarget?: string) {
  return Option.fromNullable(proxyTarget).pipe(
    Option.map((target) =>
      HttpLayerRouter.add(
        '*',
        '/*',
        Effect.gen(function* () {
          const req = yield* HttpServerRequest.HttpServerRequest;
          const url = new URL(req.url, 'http://localhost');
          const { connection: _connection, ...forwardHeaders } =
            req.headers as Record<string, string>;
          const response = yield* Effect.tryPromise({
            try: () =>
              fetch(`${target}${url.pathname}${url.search}`, {
                method: req.method,
                headers: forwardHeaders,
              }),
            catch: (e) => new Error(e instanceof Error ? e.message : String(e)),
          });
          return HttpServerResponse.fromWeb(response);
        }),
      ),
    ),
    Option.getOrElse(() => Layer.empty),
  );
}

export const OtelRoute = HttpLayerRouter.add(
  '*',
  '/otel/*',
  Effect.gen(function* () {
    const req = yield* HttpServerRequest.HttpServerRequest;
    const url = new URL(req.url, 'http://localhost');
    const otelPath = url.pathname.replace(/^\/otel/, '');
    const body = yield* req.arrayBuffer.pipe(Effect.orDie);
    const {
      connection: _connection,
      host: _host,
      ...forwardHeaders
    } = req.headers as Record<string, string>;
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(`${OTEL_BASE_URL}${otelPath}${url.search}`, {
          method: req.method,
          headers: forwardHeaders,
          ...(body.byteLength > 0 ? { body } : {}),
        }),
      catch: (e) => new Error(e instanceof Error ? e.message : String(e)),
    });
    return HttpServerResponse.fromWeb(response);
  }),
);
