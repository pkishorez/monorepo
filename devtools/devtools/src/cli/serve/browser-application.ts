import path from 'node:path';
import { Effect, Layer } from 'effect';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
  HttpStaticServer,
} from 'effect/http';

export const pagePaths: ReadonlyArray<`/${string}`> = [
  '/',
  '/lotel',
  '/monoverse',
  '/kabuki',
];

const under = (prefixes: ReadonlyArray<string>, pathname: string) =>
  prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

export const isServerPath = (pathname: string) =>
  under(['/rpc', '/v1', '/mcp', '/health'], pathname);

export function makeBrowserApplicationLive({
  uiRoot,
  version,
  endpoints,
}: {
  readonly uiRoot: string;
  readonly version: string;
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
    HttpRouter.add('GET', '/health', health),
    ...pagePaths.map((page) => HttpRouter.add('GET', page, indexResponse)),
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
      const reserved = isServerPath(pathname) || under(['/assets'], pathname);
      const acceptsHtml =
        request.headers.accept?.includes('text/html') === true;
      return reserved || !acceptsHtml
        ? Effect.succeed(HttpServerResponse.empty({ status: 404 }))
        : indexResponse;
    }),
  );

  return Layer.mergeAll(exactRoutes, assets, browserFallback);
}
