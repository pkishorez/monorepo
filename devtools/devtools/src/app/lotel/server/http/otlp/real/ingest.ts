import { Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';
import { OtlpBadRequest, OtlpHttpApi } from '../contract/index.js';
import { TelemetryStore } from '../../../services/telemetry-store/contract/index.js';
import { logRecordsFromRequest, spanRecordsFromRequest } from './records.js';

/*
 * The OTLP/HTTP receiver's handlers: what an exporter posts to `/v1/traces`
 * and `/v1/logs` is kept in the Telemetry Store. Records that cannot be
 * kept are counted back to the exporter as OTLP's partial success, never
 * failing the whole export.
 */

const invalidRequest = (signal: 'traces' | 'logs') =>
  new OtlpBadRequest({ message: `Expected an OTLP ${signal} request.` });

const partialSuccess = (rejected: number) => ({
  ...(rejected > 0 && { errorMessage: `${rejected} records were rejected.` }),
});

const OtlpHttpHandlersLive = HttpApiBuilder.group(
  OtlpHttpApi,
  'lotelOtlp',
  (handlers) =>
    handlers
      .handle('ingestTraces', ({ payload }) =>
        Effect.gen(function* () {
          if (!Array.isArray(payload.resourceSpans)) {
            return yield* invalidRequest('traces');
          }
          const normalized = spanRecordsFromRequest(payload);
          const store = yield* TelemetryStore;
          const stored = yield* store.saveSpans(normalized.records);
          const rejected = normalized.rejected + stored.rejected;
          return {
            partialSuccess: {
              rejectedSpans: rejected,
              ...partialSuccess(rejected),
            },
          };
        }),
      )
      .handle('ingestLogs', ({ payload }) =>
        Effect.gen(function* () {
          if (!Array.isArray(payload.resourceLogs)) {
            return yield* invalidRequest('logs');
          }
          const normalized = logRecordsFromRequest(payload);
          const store = yield* TelemetryStore;
          const stored = yield* store.insertLogs(normalized.records);
          const rejected = normalized.rejected + stored.rejected;
          return {
            partialSuccess: {
              rejectedLogRecords: rejected,
              ...partialSuccess(rejected),
            },
          };
        }),
      ),
);

/** The Telemetry Store the server keeps, handed on to each request. */
const keptStore = Layer.effect(TelemetryStore)(Effect.service(TelemetryStore));

/**
 * `POST /v1/traces` and `POST /v1/logs` on the server's router. Their
 * handlers read the Telemetry Store per request, so each request is handed
 * the one store the route was built with, never a store of its own.
 */
export const otlpHttpRoute = HttpApiBuilder.layer(OtlpHttpApi).pipe(
  Layer.provide(OtlpHttpHandlersLive),
  HttpRouter.provideRequest(keptStore),
);
