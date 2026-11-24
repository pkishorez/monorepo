import { Effect, Layer } from 'effect';
import { RpcSerialization, RpcServer } from 'effect/rpc';
import {
  LotelRpcError,
  TELEMETRY_RPC_PATH,
  TelemetryRpc,
  TraceNotFound,
} from '../contract/index.js';
import {
  TelemetryStore,
  TelemetryStoreError,
} from '../../../services/telemetry-store/contract/index.js';
import { makeTraceDetails, makeTraceSummary } from './traces.js';

/*
 * The Telemetry RPC, answered from the Telemetry Store and served at
 * `/rpc/lotel`. A store failure reaches the client as a LotelRpcError
 * carrying what failed; asking for a Trace no Span Record names is
 * TraceNotFound, as Log Records alone never make a Trace.
 */

const toRpcError = (cause: unknown) =>
  new LotelRpcError({
    message:
      cause instanceof TelemetryStoreError
        ? `${cause.operation}: ${cause.cause}`
        : String(cause),
  });

const DEFAULT_RECENT_TRACE_LIMIT = 20;

const listTraces = (limit: number) =>
  Effect.gen(function* () {
    const store = yield* TelemetryStore;
    const traceIds = yield* store.listRecentTraceIds(limit);
    const items = yield* Effect.forEach(traceIds, (traceId) =>
      Effect.map(store.findSpansByTrace(traceId), (spans) =>
        makeTraceSummary(traceId, spans),
      ),
    );
    return { items };
  });

const getTrace = (traceId: string) =>
  Effect.gen(function* () {
    const store = yield* TelemetryStore;
    const spans = yield* store.findSpansByTrace(traceId);
    if (spans.length === 0) return yield* new TraceNotFound({ traceId });
    const logs = yield* store.findLogsByTrace(traceId);
    return makeTraceDetails(traceId, spans, logs);
  });

/** The Telemetry RPC's handlers, needing the Telemetry Store. */
export const TelemetryRpcLive = TelemetryRpc.toLayer({
  SaveSpans: ({ records }) =>
    Effect.flatMap(TelemetryStore, (store) => store.saveSpans(records)).pipe(
      Effect.mapError(toRpcError),
    ),
  InsertLogs: ({ records }) =>
    Effect.flatMap(TelemetryStore, (store) => store.insertLogs(records)).pipe(
      Effect.mapError(toRpcError),
    ),
  ListSpans: ({ _u, limit }) =>
    Effect.flatMap(TelemetryStore, (store) => store.listSpans(_u, limit)).pipe(
      Effect.mapError(toRpcError),
    ),
  ListLogs: ({ _u, limit }) =>
    Effect.flatMap(TelemetryStore, (store) => store.listLogs(_u, limit)).pipe(
      Effect.mapError(toRpcError),
    ),
  ListTraces: ({ limit }) =>
    listTraces(limit ?? DEFAULT_RECENT_TRACE_LIMIT).pipe(
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

/** The Telemetry RPC on the server's router, over HTTP as NDJSON. */
export const telemetryRpcRoute = RpcServer.layerHttp({
  group: TelemetryRpc,
  path: TELEMETRY_RPC_PATH,
  protocol: 'http',
}).pipe(
  Layer.provide(TelemetryRpcLive),
  Layer.provide(RpcSerialization.layerNdjson),
);
