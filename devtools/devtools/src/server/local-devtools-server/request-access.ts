import { Effect } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { CONNECT_PATH } from '@kestack/devtools-kabuki/api';

/** Restricts local application access while allowing browser OTLP ingestion and Kabuki Sessions dialing in. */
export function makeRequestAccessLive({
  port,
  canonicalOrigin,
}: {
  readonly port: number;
  readonly canonicalOrigin: string;
}) {
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

  return HttpRouter.middleware(
    (app) =>
      HttpServerRequest.HttpServerRequest.use((request) => {
        const host = request.headers.host;
        if (host === undefined || !allowedHosts.has(host.toLowerCase())) {
          return Effect.succeed(
            HttpServerResponse.text('Forbidden host.', { status: 403 }),
          );
        }

        const pathname = request.url.split('?', 1)[0] ?? '/';
        const isOtlp = pathname === '/v1/traces' || pathname === '/v1/logs';
        if (isOtlp) {
          const corsHeaders = {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'POST, OPTIONS',
            'access-control-allow-private-network': 'true',
          };
          if (request.method === 'OPTIONS') {
            return Effect.succeed(
              HttpServerResponse.empty({
                status: 204,
                headers: {
                  ...corsHeaders,
                  'access-control-allow-headers':
                    request.headers['access-control-request-headers'] ?? '*',
                },
              }),
            );
          }
          return Effect.map(app, (response) =>
            HttpServerResponse.setHeaders(response, corsHeaders),
          );
        }

        // A Kabuki Session dials from whatever page its app runs in. Only
        // `/kabuki/connect` takes any origin: the Kabuki routes that read
        // and move tabs stay behind the origin check below.
        if (pathname === CONNECT_PATH) {
          if (request.method === 'OPTIONS') {
            return Effect.succeed(
              HttpServerResponse.empty({
                status: 204,
                headers: {
                  'access-control-allow-origin': '*',
                  'access-control-allow-methods': 'GET, OPTIONS',
                  'access-control-allow-private-network': 'true',
                },
              }),
            );
          }
          return app;
        }
        const origin = request.headers.origin;
        if (origin !== undefined && origin !== canonicalOrigin) {
          return Effect.succeed(
            HttpServerResponse.text('Forbidden origin.', { status: 403 }),
          );
        }

        return Effect.map(app, (response) =>
          HttpServerResponse.setHeader(
            response,
            'x-content-type-options',
            'nosniff',
          ),
        );
      }),
    { global: true },
  );
}
