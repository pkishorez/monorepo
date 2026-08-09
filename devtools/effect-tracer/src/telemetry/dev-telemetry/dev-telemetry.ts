import { Clock, Duration, Effect, Layer, Logger, Tracer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { OtlpResource } from 'effect/unstable/observability';
import { makeLogger } from './log-record.js';
import { makeRequestQueue } from './request-queue.js';
import { makeTracer } from './span-record.js';

interface DevTelemetryOptions {
  readonly endpoint?: string;
  readonly serviceName?: string;
  readonly serviceVersion?: string;
  readonly traces?: boolean;
  readonly logs?: boolean;
  readonly retries?: number;
  readonly requestTimeout?: Duration.Input;
  readonly shutdownTimeout?: Duration.Input;
}

const signalUrl = (endpoint: string, signal: string) =>
  `${endpoint.replace(/\/+$/, '')}/v1/${signal}`;

/** Creates an immediate, Effect-native OTLP layer for local development. */
export const makeDevTelemetryLayer = (options: DevTelemetryOptions = {}) => {
  const endpoint = options.endpoint ?? 'http://localhost:14400';
  const serviceName = options.serviceName ?? 'unknown-service';

  return Layer.unwrap(
    Effect.gen(function* () {
      const queue = yield* makeRequestQueue({
        retries: Math.max(0, options.retries ?? 0),
        requestTimeout: options.requestTimeout ?? Duration.seconds(3),
        shutdownTimeout: options.shutdownTimeout ?? Duration.seconds(2),
      });
      const resource = OtlpResource.make({
        serviceName,
        ...(options.serviceVersion === undefined
          ? {}
          : { serviceVersion: options.serviceVersion }),
        attributes: { 'deployment.environment': 'local' },
      });
      const scope = { name: serviceName };

      return Layer.merge(
        (options.traces ?? true)
          ? Layer.succeed(
              Tracer.Tracer,
              makeTracer({
                queue,
                url: signalUrl(endpoint, 'traces'),
                resource,
                scope,
              }),
            )
          : Layer.empty,
        (options.logs ?? true)
          ? Logger.layer(
              [
                makeLogger({
                  queue,
                  url: signalUrl(endpoint, 'logs'),
                  resource,
                  scope,
                  clock: yield* Clock.Clock,
                }),
              ],
              { mergeWithExisting: true },
            )
          : Layer.empty,
      );
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));
};
