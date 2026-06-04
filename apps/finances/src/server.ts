import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { RpcServer, RpcSerialization } from 'effect/unstable/rpc';
import { NodeSocketServer, NodeRuntime } from '@effect/platform-node';
import {
  AppRpcs,
  OverrideHandlersLive,
  SettingsHandlersLive,
  TransactionHandlersLive,
} from './server/index.js';
import { makeDbLayer } from './services/index.js';

const PORT = Number(process.env.PORT ?? 20030);
const isDev = process.env.NODE_ENV !== 'production';

const httpServer = createServer();

const CombinedHandlersLive = Effect.all([
  OverrideHandlersLive,
  TransactionHandlersLive,
  SettingsHandlersLive,
]).pipe(
  Effect.map(([overrides, transactions, settings]) => ({
    ...overrides,
    ...transactions,
    ...settings,
  })),
);

const HandlersLive = AppRpcs.toLayer(CombinedHandlersLive);

const RpcLive = RpcServer.layer(AppRpcs).pipe(
  Layer.provide(HandlersLive),
  Layer.provide(RpcServer.layerProtocolSocketServer),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(
    NodeSocketServer.layerWebSocket({ server: httpServer, path: '/rpc' }),
  ),
  Layer.provide(makeDbLayer()),
);

const program = Effect.gen(function* () {
  yield* Effect.log('Effect RPC server started');
  yield* Effect.never;
}).pipe(Effect.provide(RpcLive)) as Effect.Effect<void>;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function handleStatic(
  distPath: string,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const url = req.url ?? '/';
  const filePath = path.join(distPath, url === '/' ? 'index.html' : url);
  const ext = path.extname(filePath);

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      'content-type': MIME_TYPES[ext] ?? 'application/octet-stream',
    });
    res.end(data);
  } catch {
    const html = fs.readFileSync(path.join(distPath, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  }
}

async function start() {
  let viteDevServer: import('vite').ViteDevServer | null = null;
  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    viteDevServer = await createViteServer({
      configFile: path.resolve(import.meta.dirname, '../vite.config.ts'),
      server: { middlewareMode: true },
    });
  }

  httpServer.on('request', (req, res) => {
    if (viteDevServer) {
      viteDevServer.middlewares(req, res);
      return;
    }

    handleStatic(path.resolve(import.meta.dirname, '../dist'), req, res);
  });

  httpServer.listen(PORT, () => {
    console.log(`finances server listening on http://localhost:${PORT}`);
  });

  NodeRuntime.runMain(program);
}

start();
