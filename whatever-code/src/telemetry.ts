import { Otlp } from '@effect/opentelemetry';
import { FetchHttpClient } from '@effect/platform';
import { Layer } from 'effect';
import { OTEL_BASE_URL } from './constants.js';

export const TelemetryLayer = Otlp.layerJson({
  baseUrl: OTEL_BASE_URL,
  resource: {
    serviceName: 'whatever-code:backend',
  },
}).pipe(Layer.provide(FetchHttpClient.layer));
