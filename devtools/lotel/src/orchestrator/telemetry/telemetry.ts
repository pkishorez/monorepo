import { Effect, Layer } from 'effect';
import { nextUlid } from 'std-toolkit/core';
import { HttpApi, HttpApiBuilder } from 'effect/unstable/httpapi';
import {
  logRecordsFromRequest,
  makeTraceDetails,
  spanRecordsFromRequest,
} from '../../domain/telemetry/index.js';
import {
  LotelRpcError,
  OtlpBadRequest,
  TraceNotFound,
} from '../../domain/telemetry-schema/index.js';
import { TelemetryStore } from '../../services/telemetry-store/index.js';
import { makeLotelOtlpHttpGroup } from './otlp-http.js';
import { LotelRpc } from './rpc-entry.js';

export { LotelRpc } from './rpc-entry.js';
export const LotelOtlpHttpGroup = makeLotelOtlpHttpGroup();

const toRpcError = (cause: unknown) =>
  new LotelRpcError({ message: String(cause) });

const saveSpans = (
  records: Parameters<(typeof TelemetryStore.Service)['saveSpans']>[0],
) => Effect.flatMap(TelemetryStore, (store) => store.saveSpans(records));

const insertLogs = (
  records: ReadonlyArray<{
    traceId: string | null;
    spanId: string | null;
    log: object;
    context: object;
  }>,
) =>
  Effect.gen(function* () {
    const store = yield* TelemetryStore;
    const identified = yield* Effect.forEach(records, (record) =>
      Effect.map(nextUlid, (id) => ({ ...record, id })),
    );
    return yield* store.insertLogs(identified);
  });

const getTrace = (traceId: string) =>
  Effect.gen(function* () {
    const store = yield* TelemetryStore;
    const spans = yield* store.findSpansByTrace(traceId);
    if (spans.length === 0) return yield* new TraceNotFound({ traceId });
    const logs = yield* store.findLogsByTrace(traceId);
    return makeTraceDetails(traceId, spans, logs);
  });

export const LotelRpcLive = LotelRpc.toLayer({
  SaveSpans: ({ records }) =>
    saveSpans(records).pipe(Effect.mapError(toRpcError)),
  InsertLogs: ({ records }) =>
    insertLogs(records).pipe(Effect.mapError(toRpcError)),
  ListSpans: ({ _u, limit }) =>
    Effect.flatMap(TelemetryStore, (store) => store.listSpans(_u, limit)).pipe(
      Effect.mapError(toRpcError),
    ),
  ListLogs: ({ _u, limit }) =>
    Effect.flatMap(TelemetryStore, (store) => store.listLogs(_u, limit)).pipe(
      Effect.mapError(toRpcError),
    ),
  GetTrace: ({ traceId }) =>
    getTrace(traceId).pipe(
      Effect.mapError((cause) =>
        cause._tag === 'TraceNotFound' ? cause : toRpcError(cause),
      ),
    ),
  ClearTelemetry: () =>
    Effect.flatMap(TelemetryStore, (store) => store.clearTelemetry).pipe(
      Effect.map((deleted) => ({ deleted })),
      Effect.mapError(toRpcError),
    ),
});

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

export const LotelOtlpHttpLive = HttpApiBuilder.layer(LotelOtlpHttpApi).pipe(
  Layer.provide(LotelOtlpHttpHandlersLive),
);
