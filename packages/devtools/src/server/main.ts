#!/usr/bin/env node
import { exec } from 'node:child_process';
import { createServer } from 'node:http';
import { Config, Effect, Layer, References } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import {
  HttpMiddleware,
  HttpRouter,
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
 * Stamp `Access-Control-Allow-Private-Network: true` onto every response.
 * The hosted frontend is served over HTTPS from a public origin, so requests
 * to this loopback server trigger Chrome's Private Network Access preflight,
 * which {@link HttpMiddleware.cors} does not satisfy on its own. Wrapping the
 * cors'd app means the header lands on both the 204 preflight and real
 * responses; browsers ignore it where it isn't needed.
 */
const allowPrivateNetwork = <E, R>(
  app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
) =>
  Effect.map(app, (response) =>
    HttpServerResponse.setHeader(
      response,
      'access-control-allow-private-network',
      'true',
    ),
  );

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
  HttpRouter.serve(
    Layer.mergeAll(RoutesLive, makeIndexRouteLive({ serverUrl, openUrl })),
    {
      // The frontend is served from a different origin, so allow cross-origin calls
      // to both the `/rpc` and `/v1/*` surfaces.
      middleware: (app) =>
        allowPrivateNetwork(
          HttpMiddleware.cors({
            allowedOrigins: ['*'],
            allowedMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
          })(app),
        ),
    },
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
