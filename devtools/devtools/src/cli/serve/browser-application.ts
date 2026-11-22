import path from 'node:path';
import { Effect, Layer } from 'effect';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
  HttpStaticServer,
} from 'effect/http';

/**
 * Serves the bundled app, at every Tool's page and any other address a
 * browser asks for, and `/health`: what this server is, and every endpoint
 * it answers, the app's own and each Tool's.
 */
export function makeBrowserApplicationLive({
  uiRoot,
  version,
  endpoints,
}: {
  readonly uiRoot: string;
  readonly version: string;
  /** Each Tool's endpoints, by path, as its server door lists them. */
  readonly endpoints: Readonly<Record<string, string>>;
}) {
  const indexPath = path.join(uiRoot, 'index.html');
  const indexResponse = HttpServerResponse.file(indexPath, {
    headers: { 'cache-control': 'no-cache' },
  });
  const health = HttpServerResponse.json({
    name: 'devtools',
    version,
    endpoints: {
      '/': 'DevTools browser application.',
      '/lotel': 'Lotel Tool.',
      '/monoverse': 'Monoverse Tool: ?project= opens a Project.',
      '/kabuki': 'Kabuki Tool: the live Kabuki Sessions, ?session= opens one.',
      ...endpoints,
    },
  });

  const exactRoutes = Layer.mergeAll(
    HttpRouter.add('GET', '/', indexResponse),
    HttpRouter.add('GET', '/lotel', indexResponse),
    HttpRouter.add('GET', '/monoverse', indexResponse),
    HttpRouter.add('GET', '/kabuki', indexResponse),
    HttpRouter.add('GET', '/health', health),
  );
  const assets = HttpStaticServer.layer({
    root: path.join(uiRoot, 'assets'),
    prefix: '/assets',
    cacheControl: 'public, max-age=31536000, immutable',
  });
  const browserFallback = HttpRouter.add(
    'GET',
    '/*',
    HttpServerRequest.HttpServerRequest.use((request) => {
      const pathname = request.url.split('?', 1)[0] ?? '/';
      const reserved = ['/rpc', '/v1', '/health', '/assets'].some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
      );
      const acceptsHtml =
        request.headers.accept?.includes('text/html') === true;
      return reserved || !acceptsHtml
        ? Effect.succeed(HttpServerResponse.empty({ status: 404 }))
        : indexResponse;
    }),
  );

  return Layer.mergeAll(exactRoutes, assets, browserFallback);
}
