import { Effect, Layer } from 'effect';
import { RpcSerialization, RpcServer } from 'effect/rpc';
import {
  LotelRpcError,
  TELEMETRY_RPC_PATH,
  TelemetryRpc,
} from '../contract/index.js';
import {
  TelemetryStore,
  TelemetryStoreError,
} from '../../../services/telemetry-store/contract/index.js';
import { Traces } from '../../../services/traces/contract/index.js';

const toRpcError = (cause: unknown) =>
  new LotelRpcError({
    message:
      cause instanceof TelemetryStoreError
        ? `${cause.operation}: ${cause.cause}`
        : String(cause),
  });

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
    Effect.flatMap(Traces, (traces) => traces.list(limit)).pipe(
      Effect.mapError(toRpcError),
    ),
  GetTrace: ({ traceId }) =>
    Effect.flatMap(Traces, (traces) => traces.get(traceId)).pipe(
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

export const telemetryRpcRoute = RpcServer.layerHttp({
  group: TelemetryRpc,
  path: TELEMETRY_RPC_PATH,
  protocol: 'http',
}).pipe(
  Layer.provide(TelemetryRpcLive),
  Layer.provide(RpcSerialization.layerNdjson),
);
