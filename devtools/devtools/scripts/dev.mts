import { readFileSync } from 'node:fs';
import { type IncomingMessage, type ServerResponse, Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Effect, References } from 'effect';
import { NodeRuntime } from '@effect/platform-node';
import { createServer as createViteServer } from 'vite-plus';
import {
  defaultDbPath,
  isServerPath,
  makeDevtoolsServer,
  pagePaths,
} from '../src/cli/serve/index.js';

const port = 14400;
const db = process.env.DEVTOOLS_DB ?? defaultDbPath;
const viteSockets = new Set(['vite-hmr', 'vite-ping']);
const url = `http://127.0.0.1:${port}`;
const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

const hmr = new Server();
const vite = await createViteServer({
  root,
  configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
  appType: 'spa',
  server: { middlewareMode: true, hmr: { server: hmr } },
});

class DevServer extends Server {
  override emit(event: string | symbol, ...args: Array<unknown>): boolean {
    if (event === 'request') {
      const [request, response] = args as [IncomingMessage, ServerResponse];
      const pathname = new URL(request.url ?? '/', url).pathname;
      if (isServerPath(pathname)) return super.emit(event, ...args);
      if (pagePaths.some((page) => page === pathname))
        request.headers['sec-fetch-dest'] = 'document';
      vite.middlewares(request, response, (error?: unknown) => {
        if (error === undefined) return super.emit(event, request, response);
        response.statusCode = 500;
        response.end(String(error));
        return true;
      });
      return true;
    }
    if (event === 'upgrade') {
      const [request] = args as [IncomingMessage];
      if (viteSockets.has(request.headers['sec-websocket-protocol'] ?? ''))
        return hmr.emit(event, ...args);
    }
    return super.emit(event, ...args);
  }
}

Effect.gen(function* () {
  console.log(`devtools dev running on ${url}`);
  console.log(`storage: ${db}`);
  yield* Effect.never;
}).pipe(
  Effect.provide(
    makeDevtoolsServer({
      port,
      db,
      version,
      skipUiCheck: true,
      createServer: () => new DevServer(),
    }),
  ),
  Effect.ensuring(Effect.promise(() => vite.close())),
  Effect.provideService(References.MinimumLogLevel, 'None'),
  NodeRuntime.runMain,
);
