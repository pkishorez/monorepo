import * as NodeSdk from '@effect/opentelemetry/NodeSdk';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

const signalUrl = (endpoint: string, signal: string) =>
  `${endpoint.replace(/\/+$/, '')}/v1/${signal}`;

const tolerateUnavailableCollector = <Exporter extends object>(
  exporter: Exporter,
): Exporter =>
  new Proxy(exporter, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property === 'export' && typeof value === 'function') {
        return (
          items: unknown,
          callback: (result: { code: number }) => void,
        ) => {
          try {
            return value.call(target, items, (result: { code: number }) =>
              callback(result.code === 0 ? result : { code: 0 }),
            );
          } catch {
            callback({ code: 0 });
          }
        };
      }
      if (
        (property === 'shutdown' || property === 'forceFlush') &&
        typeof value === 'function'
      ) {
        return (...args: unknown[]) =>
          Promise.resolve(value.apply(target, args)).catch(() => undefined);
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

export const makeOtlpLayer = (options: {
  endpoint: string;
  serviceName: string;
  serviceVersion?: string;
  traces: boolean;
  logs: boolean;
  metrics: boolean;
}) =>
  NodeSdk.layer(() => ({
    ...(options.traces
      ? {
          spanProcessor: new BatchSpanProcessor(
            tolerateUnavailableCollector(
              new OTLPTraceExporter({
                url: signalUrl(options.endpoint, 'traces'),
                timeoutMillis: 1_000,
              }),
            ),
            { scheduledDelayMillis: 500, exportTimeoutMillis: 1_000 },
          ),
        }
      : {}),
    ...(options.logs
      ? {
          logRecordProcessor: new BatchLogRecordProcessor({
            exporter: tolerateUnavailableCollector(
              new OTLPLogExporter({
                url: signalUrl(options.endpoint, 'logs'),
                timeoutMillis: 1_000,
              }),
            ),
            scheduledDelayMillis: 500,
            exportTimeoutMillis: 1_000,
          }),
        }
      : {}),
    ...(options.metrics
      ? {
          metricReader: new PeriodicExportingMetricReader({
            exporter: tolerateUnavailableCollector(
              new OTLPMetricExporter({
                url: signalUrl(options.endpoint, 'metrics'),
                timeoutMillis: 900,
              }),
            ),
            exportIntervalMillis: 1_000,
            exportTimeoutMillis: 900,
          }),
        }
      : {}),
    loggerMergeWithExisting: true,
    resource: {
      serviceName: options.serviceName,
      ...(options.serviceVersion === undefined
        ? {}
        : { serviceVersion: options.serviceVersion }),
      attributes: { 'deployment.environment': 'local' },
    },
    shutdownTimeout: '2 seconds',
  }));
