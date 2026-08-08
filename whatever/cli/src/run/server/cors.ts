import { Effect } from 'effect';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/unstable/http';

import { isAllowedOrigin } from './origin.ts';

const corsHeaders = (origin: string): Record<string, string> => ({
  'access-control-allow-origin': origin,
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-private-network': 'true',
  vary: 'origin',
});

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

export const CorsMiddlewareLive = HttpRouter.middleware(corsMiddleware, {
  global: true,
});
