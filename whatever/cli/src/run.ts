import { createServer } from 'node:http';
import path from 'node:path';
import { Config, Effect, Layer } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/unstable/http';
import { RpcServer } from 'effect/unstable/rpc';
import { NodeHttpServer, NodeServices } from '@effect/platform-node';
import { DEFAULT_DB_PATH, makeCodeHandlers } from '@pkishorez/code';
import { CodeRpcSerialization, CodeRpcs } from '@pkishorez/code/contract';

const ALLOWED_DOMAINS = ['kishore.app'];
const HOST = '127.0.0.1';

const port = Flag.integer('port').pipe(
  Flag.withAlias('p'),
  Flag.withDescription('Port to listen on'),
  Flag.withFallbackConfig(
    Config.int('WHATEVER_PORT').pipe(Config.orElse(() => Config.int('PORT'))),
  ),
  Flag.withDefault(14500),
);

const db = Flag.string('db').pipe(
  Flag.withDescription('Path to the whatever database'),
  Flag.withFallbackConfig(Config.string('WHATEVER_DB')),
  Flag.withDefault(DEFAULT_DB_PATH),
);

const isAllowedOrigin = (origin: string) =>
  origin.startsWith('https://') &&
  ALLOWED_DOMAINS.some(
    (domain) => origin === `https://${domain}` || origin.endsWith(`.${domain}`),
  );

const corsHeaders = (origin: string): Record<string, string> => ({
  'access-control-allow-origin': origin,
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-private-network': 'true',
  vary: 'origin',
});

// Set on both the preflight and real responses; the `middleware` option on
// HttpRouter.serve runs around response sending and drops header mutations.
const corsMiddleware = <E, R>(
  app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
) =>
  Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) => {
    const origin = request.headers.origin;
    if (origin === undefined) return app;
    if (!isAllowedOrigin(origin)) {
      return Effect.succeed(HttpServerResponse.empty({ status: 403 }));
    }
    if (request.method === 'OPTIONS') {
      return Effect.succeed(
        HttpServerResponse.setHeaders(
          HttpServerResponse.empty({ status: 204 }),
          {
            ...corsHeaders(origin),
            'access-control-allow-headers':
              request.headers['access-control-request-headers'] ?? '*',
          },
        ),
      );
    }
    return Effect.map(app, (response) =>
      HttpServerResponse.setHeaders(response, corsHeaders(origin)),
    );
  });

const CorsMiddlewareLive = HttpRouter.middleware(corsMiddleware, {
  global: true,
});

const makeServerLive = (options: { port: number; db: string }) =>
  HttpRouter.serve(
    Layer.mergeAll(
      RpcServer.layerHttp({
        group: CodeRpcs,
        path: '/rpc',
        protocol: 'websocket',
      }).pipe(
        Layer.provide(makeCodeHandlers({ dbPath: options.db })),
        Layer.provide(CodeRpcSerialization),
      ),
      CorsMiddlewareLive,
    ),
  ).pipe(
    Layer.provide(
      NodeHttpServer.layer(createServer, { host: HOST, port: options.port }),
    ),
    Layer.provide(NodeServices.layer),
  );

const serveCommand = Command.make(
  'serve',
  { port, db },
  Effect.fn(function* ({ port, db }) {
    yield* Effect.gen(function* () {
      console.log(`whatever code server on ws://${HOST}:${port}/rpc`);
      console.log(`db: ${path.resolve(db)}`);
      yield* Effect.never;
    }).pipe(Effect.provide(makeServerLive({ port, db })));
  }),
).pipe(Command.withDescription('Serve the code RPC over websocket'));

const codeCommand = Command.make('code').pipe(
  Command.withSubcommands([serveCommand]),
);

const rootCommand = Command.make('whatever');

const command = rootCommand.pipe(Command.withSubcommands([codeCommand]));

export const cli = command.pipe(Command.run({ version: '0.0.1' }));
