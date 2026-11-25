import { Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';
import { OtlpBadRequest, OtlpHttpApi } from '../contract/index.js';
import { TelemetryStore } from '../../../services/telemetry-store/contract/index.js';
import { logRecordsFromRequest, spanRecordsFromRequest } from './records.js';

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

const keptStore = Layer.effect(TelemetryStore)(Effect.service(TelemetryStore));

export const otlpHttpRoute = HttpApiBuilder.layer(OtlpHttpApi).pipe(
  Layer.provide(OtlpHttpHandlersLive),
  HttpRouter.provideRequest(keptStore),
);
