import { Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/http';
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
} from 'effect/http-api';
import {
  ExportLogsServiceRequestSchema,
  ExportLogsServiceResponseSchema,
  ExportTraceServiceRequestSchema,
  ExportTraceServiceResponseSchema,
  OtlpBadRequest,
  OtlpInternalError,
} from '../../contract/index.js';
import {
  TelemetryStore,
  insertLogs,
  saveSpans,
} from '../telemetry-store/index.js';
import { logRecordsFromRequest, spanRecordsFromRequest } from './records.js';

/*
 * The OTLP/HTTP receiver: any OpenTelemetry exporter posts JSON to
 * `/v1/traces` and `/v1/logs`, and what it sends is kept in the Telemetry
 * Store. Records that cannot be kept are counted back to the exporter as
 * OTLP's partial success, never failing the whole export.
 */

export const LotelOtlpHttpGroup = HttpApiGroup.make('lotelOtlp')
  .add(
    HttpApiEndpoint.post('ingestTraces', '/v1/traces', {
      payload: ExportTraceServiceRequestSchema,
      success: ExportTraceServiceResponseSchema,
      error: [OtlpBadRequest, OtlpInternalError],
    }),
  )
  .add(
    HttpApiEndpoint.post('ingestLogs', '/v1/logs', {
      payload: ExportLogsServiceRequestSchema,
      success: ExportLogsServiceResponseSchema,
      error: [OtlpBadRequest, OtlpInternalError],
    }),
  );

class LotelOtlpHttpApi extends HttpApi.make('lotelOtlpHttpApi').add(
  LotelOtlpHttpGroup,
) {}

const invalidRequest = (signal: 'traces' | 'logs') =>
  new OtlpBadRequest({ message: `Expected an OTLP ${signal} request.` });

const partialSuccess = (rejected: number) => ({
  ...(rejected > 0 && { errorMessage: `${rejected} records were rejected.` }),
});

const LotelOtlpHttpHandlersLive = HttpApiBuilder.group(
  LotelOtlpHttpApi,
  'lotelOtlp',
  (handlers) =>
    handlers
      .handle('ingestTraces', ({ payload }) =>
        Effect.gen(function* () {
          if (!Array.isArray(payload.resourceSpans)) {
            return yield* invalidRequest('traces');
          }
          const normalized = spanRecordsFromRequest(payload);
          const stored = yield* saveSpans(normalized.records);
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
          const stored = yield* insertLogs(normalized.records);
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
export const lotelIngestRoute = HttpApiBuilder.layer(LotelOtlpHttpApi).pipe(
  Layer.provide(LotelOtlpHttpHandlersLive),
  HttpRouter.provideRequest(keptStore),
);
