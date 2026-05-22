import {
  OtlpLogger,
  OtlpSerialization,
  OtlpTracer,
} from '@effect/opentelemetry';
import { FetchHttpClient } from '@effect/platform';
import { Layer } from 'effect';

const resource = { serviceName: 'code:frontend' };

export const FrontendTelemetryLayer = Layer.mergeAll(
  OtlpLogger.layer({
    url: '/api/otel/v1/logs',
    resource,
    maxBatchSize: 0,
    exportInterval: '5 seconds',
  }),
  OtlpTracer.layer({
    url: '/api/otel/v1/traces',
    resource,
    maxBatchSize: 0,
    exportInterval: '5 seconds',
  }),
).pipe(
  Layer.provide(OtlpSerialization.layerJson),
  Layer.provide(FetchHttpClient.layer),
);
