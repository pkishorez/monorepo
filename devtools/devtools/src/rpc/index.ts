import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  LogRecordSchema,
  MetricRecordSchema,
  TraceRecordSchema,
} from '@pkishorez/lotel/client';
import { EntitySchema } from 'std-toolkit/core';

/** A genuine fs/exec failure while assembling a payload (not "not configured"). */
export class DevtoolsRpcError extends Schema.TaggedErrorClass<DevtoolsRpcError>(
  'DevtoolsRpcError',
)('DevtoolsRpcError', {
  message: Schema.String,
}) {}

/** A trace lookup failed because no stored spans have the requested trace id. */
export class TraceNotFound extends Schema.TaggedErrorClass<TraceNotFound>(
  'TraceNotFound',
)('TraceNotFound', {
  traceId: Schema.String,
}) {}

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
const TraceSuccess = Schema.Struct({
  traceId: Schema.String,
  spans: Schema.Array(
    TraceRecordSchema.schema as unknown as Schema.Codec<
      typeof TraceRecordSchema.Type,
      typeof TraceRecordSchema.Type
    >,
  ),
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
 * the global Telemetry read procedures backed by lotel's orchestration.
 * Telemetry ingestion is served separately over OTLP/HTTP (see ADR 0001).
 */
export const DevtoolsRpc = RpcGroup.make(
  Rpc.make('QueryTraces', {
    payload: QueryPayload,
    success: TraceListSuccess,
    error: DevtoolsRpcError,
  }),
  Rpc.make('GetTrace', {
    payload: { traceId: Schema.String },
    success: TraceSuccess,
    error: Schema.Union([TraceNotFound, DevtoolsRpcError]),
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
