#!/usr/bin/env node
import { exec } from 'node:child_process';
import { createServer } from 'node:http';
import { Config, Effect, Layer, References } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/unstable/http';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import {
  NodeHttpServer,
  NodeRuntime,
  NodeServices,
} from '@effect/platform-node';
import { DEFAULT_DB_PATH, LotelApiLive, makeDbLayer } from '@kishorez/lotel';
import { DevtoolsRpc } from '../rpc/index.js';
import { DevtoolsHandlersLive } from './handlers.js';

// The server always binds to loopback; only the port and db path are configurable.
const HOST = '127.0.0.1';
const APP_URL = process.env.DEVTOOLS_APP_URL ?? 'https://kishore.app/devtools';

/** Best-effort, silent open of the DevTools frontend in the default browser. */
const openInBrowser = (url: string) => {
  const opener =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start ""'
        : 'xdg-open';
  exec(`${opener} ${JSON.stringify(url)}`, () => {});
};

/** Frontend surface: the typed RPC group consumed by the `/devtools` route. */
const RpcRouteLive = RpcServer.layerHttp({
  group: DevtoolsRpc,
  path: '/rpc',
  protocol: 'http',
}).pipe(
  Layer.provide(DevtoolsHandlersLive),
  Layer.provide(RpcSerialization.layerNdjson),
);

/**
 * Landing route: a human-readable description of what this server is and the
 * endpoints it exposes, plus the URL to open the hosted frontend against it.
 */
const makeIndexRouteLive = ({
  serverUrl,
  openUrl,
}: {
  serverUrl: string;
  openUrl: string;
}) =>
  HttpRouter.add(
    'GET',
    '/',
    HttpServerResponse.json({
      name: 'devtools',
      description:
        "Local devtools server for inspecting a project's dependency graph and OpenTelemetry data.",
      open: openUrl,
      endpoints: {
        '/': 'This description.',
        '/rpc': 'Typed RPC endpoint consumed by the devtools frontend.',
        '/v1/traces': 'OTLP/HTTP ingest for traces.',
        '/v1/metrics': 'OTLP/HTTP ingest for metrics.',
        '/v1/logs': 'OTLP/HTTP ingest for logs.',
      },
      serverUrl,
    }),
  );

/**
 * One process, two surfaces (see ADR 0001): `/rpc` for the frontend and lotel's
 * OTLP/HTTP ingest endpoints (`/v1/*`) for external apps. Both share one `Db`.
 */
const RoutesLive = Layer.mergeAll(RpcRouteLive, LotelApiLive);

/**
 * Cross-origin headers applied to every response. The hosted frontend is served
 * over HTTPS from a public origin, so it both needs standard CORS headers and
 * triggers Chrome's Private Network Access preflight when reaching this loopback
 * server.
 */
const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-private-network': 'true',
};

/**
 * Self-contained CORS middleware, registered as global router middleware so it
 * wraps each route handler *before* the response is sent. The `middleware`
 * option on {@link HttpRouter.serve} runs around response sending, so changes it
 * makes to real responses are discarded — only the preflight (which it replaces
 * wholesale) survived, leaving actual responses without
 * `Access-Control-Allow-Origin`. This sets the headers on both the 204 preflight
 * and every actual response.
 */
const corsMiddleware = <E, R>(
  app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
) =>
  Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
    request.method === 'OPTIONS'
      ? Effect.succeed(
          HttpServerResponse.setHeaders(
            HttpServerResponse.empty({ status: 204 }),
            {
              ...CORS_HEADERS,
              'access-control-allow-headers':
                request.headers['access-control-request-headers'] ?? '*',
            },
          ),
        )
      : Effect.map(app, (response) =>
          HttpServerResponse.setHeaders(response, CORS_HEADERS),
        ),
  );

/** Global CORS middleware layer; applies to every registered route. */
const CorsMiddlewareLive = HttpRouter.middleware(corsMiddleware, {
  global: true,
});

const makeServerLive = ({
  port,
  db,
  serverUrl,
  openUrl,
}: {
  port: number;
  db: string;
  serverUrl: string;
  openUrl: string;
}) =>
  // The frontend is served from a different origin, so CORS is applied to every
  // route (the `/rpc` and `/v1/*` surfaces) via the global middleware layer.
  HttpRouter.serve(
    Layer.mergeAll(
      RoutesLive,
      makeIndexRouteLive({ serverUrl, openUrl }),
      CorsMiddlewareLive,
    ),
  ).pipe(
    Layer.provide(makeDbLayer({ dbPath: db })),
    Layer.provide(NodeHttpServer.layer(createServer, { host: HOST, port })),
    Layer.provide(NodeServices.layer),
  );

const port = Flag.integer('port').pipe(
  Flag.withAlias('p'),
  Flag.withDescription('Port to listen on'),
  Flag.withFallbackConfig(Config.int('DEVTOOLS_PORT')),
  Flag.withDefault(14400),
);

const db = Flag.string('db').pipe(
  Flag.withDescription('Path to the telemetry database'),
  Flag.withFallbackConfig(Config.string('DEVTOOLS_DB')),
  Flag.withDefault(DEFAULT_DB_PATH),
);

const command = Command.make(
  'devtools',
  { port, db },
  Effect.fn(function* ({ port, db }) {
    const serverUrl = `http://localhost:${port}`;
    const openUrl = `${APP_URL}?url=${encodeURIComponent(serverUrl)}`;

    yield* Effect.gen(function* () {
      console.log(`devtools running on ${serverUrl}`);
      console.log(`open: ${openUrl}`);
      openInBrowser(openUrl);
      yield* Effect.never;
    }).pipe(Effect.provide(makeServerLive({ port, db, serverUrl, openUrl })));
  }),
).pipe(Command.withDescription('Local devtools RPC + telemetry server'));

command.pipe(
  Command.run({ version: '0.0.0' }),
  Effect.provide(NodeServices.layer),
  // The CLI is consumed only by the frontend: silence all Effect logging.
  Effect.provideService(References.MinimumLogLevel, 'None'),
  NodeRuntime.runMain,
);
