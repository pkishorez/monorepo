import { createServer } from 'node:http';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { RpcServer, RpcSerialization } from '@effect/rpc';
import { NodeSocketServer } from '@effect/platform-node';
import { NodeRuntime } from '@effect/platform-node';
import { AppRpcs } from './server/api/app.js';
import { TerminalHandlersLive } from './server/handlers/terminal.js';
import { TerminalServiceLive } from './services/terminal.js';
import { makeTelemetryLayer } from './services/telemetry.js';
import { createRequestHandler } from './server/http.js';

const PORT = Number(process.env.PORT ?? 20020);
const isDev = process.env.NODE_ENV !== 'production';
const OTEL_BASE_URL = (process.env.OTEL_BASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '');

const httpServer = createServer();

const RpcLive = RpcServer.layer(AppRpcs).pipe(
  Layer.provide(TerminalHandlersLive),
  Layer.provide(TerminalServiceLive),
  Layer.provide(RpcServer.layerProtocolSocketServer),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(
    NodeSocketServer.layerWebSocket({ server: httpServer, path: '/rpc' }),
  ),
  Layer.provide(makeTelemetryLayer(OTEL_BASE_URL)),
);

const program = Effect.gen(function* () {
  yield* Effect.log('Effect RPC server started');
  yield* Effect.never;
}).pipe(Effect.provide(RpcLive));

async function start() {
  let viteDevServer: import('vite').ViteDevServer | null = null;
  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    viteDevServer = await createViteServer({
      configFile: path.resolve(import.meta.dirname, '../vite.config.ts'),
      server: { middlewareMode: true },
    });
  }

  httpServer.on(
    'request',
    createRequestHandler({
      distPath: path.resolve(import.meta.dirname, '../dist'),
      viteDevServer,
    }),
  );

  httpServer.listen(PORT, () => {
    console.log(`code server listening on http://localhost:${PORT}`);
  });

  NodeRuntime.runMain(program);
}

start();
