import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import type { DepcruiseVizData } from 'depcruise-viz';
import {
  LogRecordSchema,
  MetricRecordSchema,
  TraceRecordSchema,
} from '@kishorez/lotel/client';
import { EntitySchema } from 'std-toolkit/core';

/** A genuine fs/exec failure while assembling a payload (not "not configured"). */
export class DevtoolsRpcError extends Schema.TaggedErrorClass<DevtoolsRpcError>(
  'DevtoolsRpcError',
)('DevtoolsRpcError', {
  message: Schema.String,
}) {}

const DepcruiseData = Schema.Any as unknown as Schema.Codec<DepcruiseVizData>;

const RunDepcruiseSuccess = Schema.Union([
  Schema.Struct({ available: Schema.Literal(false) }),
  Schema.Struct({
    available: Schema.Literal(true),
    data: DepcruiseData,
  }),
]);

/**
 * A sort-key bound over the monotonic record id. The operator encodes the scan
 * direction: `>`/`>=` page oldest-to-newest (live tail), `<`/`<=` page
 * newest-to-oldest (new-to-old backfill); a `null` value scans the whole set.
 */
const SkBound = Schema.Union([
  Schema.Struct({ '>': Schema.NullOr(Schema.String) }),
  Schema.Struct({ '>=': Schema.NullOr(Schema.String) }),
  Schema.Struct({ '<': Schema.NullOr(Schema.String) }),
  Schema.Struct({ '<=': Schema.NullOr(Schema.String) }),
]);

const QueryPayload = { sk: SkBound, limit: Schema.optional(Schema.Number) };

const TraceListSuccess = Schema.Struct({
  items: Schema.Array(EntitySchema(TraceRecordSchema)),
});
const LogListSuccess = Schema.Struct({
  items: Schema.Array(EntitySchema(LogRecordSchema)),
});
const MetricListSuccess = Schema.Struct({
  items: Schema.Array(EntitySchema(MetricRecordSchema)),
});
const ClearSuccess = Schema.Struct({ deleted: Schema.Number });

/**
 * The DevTools umbrella RPC surface consumed by the `/devtools` route. Carries
 * the Dependencies procedure (`RunDepcruise`, path-driven) and the global
 * Telemetry read procedures backed by lotel's orchestration. Telemetry
 * *ingestion* is served separately over OTLP/HTTP (see ADR 0001).
 */
export const DevtoolsRpc = RpcGroup.make(
  Rpc.make('RunDepcruise', {
    payload: { path: Schema.String },
    success: RunDepcruiseSuccess,
    error: DevtoolsRpcError,
  }),
  Rpc.make('QueryTraces', {
    payload: QueryPayload,
    success: TraceListSuccess,
    error: DevtoolsRpcError,
  }),
  Rpc.make('QueryLogs', {
    payload: QueryPayload,
    success: LogListSuccess,
    error: DevtoolsRpcError,
  }),
  Rpc.make('QueryMetrics', {
    payload: QueryPayload,
    success: MetricListSuccess,
    error: DevtoolsRpcError,
  }),
  Rpc.make('ClearTelemetry', {
    payload: {},
    success: ClearSuccess,
    error: DevtoolsRpcError,
  }),
);
