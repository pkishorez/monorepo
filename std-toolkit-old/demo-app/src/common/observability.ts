import * as Otlp from '@effect/opentelemetry/Otlp';
import { FetchHttpClient } from '@effect/platform';
import { Layer } from 'effect';

export const ObservabilityLayer = Otlp.layer({
  baseUrl: 'http://localhost:4318',
  resource: {
    serviceName: 'todos-app',
  },
}).pipe(Layer.provide(FetchHttpClient.layer), Layer.orDie);
