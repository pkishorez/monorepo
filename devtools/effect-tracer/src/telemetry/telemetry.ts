import { makeOtlpLayer } from './otlp.js';

export const makeTelemetryLayer = (
  options: {
    endpoint?: string;
    serviceName?: string;
    serviceVersion?: string;
    traces?: boolean;
    logs?: boolean;
    metrics?: boolean;
  } = {},
) => {
  return makeOtlpLayer({
    endpoint: options.endpoint ?? 'http://localhost:14400',
    serviceName: options.serviceName ?? 'unknown-service',
    traces: options.traces ?? true,
    logs: options.logs ?? true,
    metrics: options.metrics ?? true,
    ...(options.serviceVersion === undefined
      ? {}
      : { serviceVersion: options.serviceVersion }),
  });
};
