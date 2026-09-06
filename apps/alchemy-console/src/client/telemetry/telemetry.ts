import { makeDevTelemetryLayer } from '@pkishorez/effect-tracer/telemetry/dev-telemetry';
import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

export function telemetryLayer() {
  // The collector runs on the developer's machine, not in deployed Workers.
  if (!import.meta.env.DEV) return Layer.empty;

  return makeDevTelemetryLayer({
    endpoint: 'http://127.0.0.1:14400',
    serviceName: 'alchemy-console-frontend',
  }).pipe(
    Layer.provide(
      Layer.succeed(FetchHttpClient.RequestInit, {
        redirect: 'manual',
        credentials: 'omit',
        keepalive: true,
      }),
    ),
    // Keep the exporter's cookie-free HTTP client separate from authenticated RPC.
    Layer.fresh,
  );
}
