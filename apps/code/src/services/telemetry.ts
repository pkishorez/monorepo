import { Otlp } from 'effect/unstable/observability';
import { FetchHttpClient } from 'effect/unstable/http';
import { Layer } from 'effect';

export const makeTelemetryLayer = (baseUrl: string | undefined | null) => {
  const normalizedBaseUrl = baseUrl?.trim().replace(/\/+$/, '') ?? '';
  if (normalizedBaseUrl === '') return Layer.empty;

  return Otlp.layerJson({
    baseUrl: normalizedBaseUrl,
    resource: {
      serviceName: 'code:backend',
    },
    maxBatchSize: 0,
    tracerExportInterval: '3 seconds',
    loggerExportInterval: '3 seconds',
    metricsExportInterval: '3 seconds',
  }).pipe(Layer.provide(FetchHttpClient.layer));
};
