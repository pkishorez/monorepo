import path from 'node:path';
import { Effect, Layer } from 'effect';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
  HttpStaticServer,
} from 'effect/unstable/http';

/** Serves the bundled browser application and machine-readable health data. */
export function makeBrowserApplicationLive({
  uiRoot,
  version,
}: {
  readonly uiRoot: string;
  readonly version: string;
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
      '/laymos': 'Laymos Tool.',
      '/rpc': 'Typed RPC endpoint.',
      '/v1/traces': 'OTLP/HTTP Trace ingestion.',
      '/v1/logs': 'OTLP/HTTP Log Record ingestion.',
    },
  });

  const exactRoutes = Layer.mergeAll(
    HttpRouter.add('GET', '/', indexResponse),
    HttpRouter.add('GET', '/lotel', indexResponse),
    HttpRouter.add('GET', '/laymos', indexResponse),
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
