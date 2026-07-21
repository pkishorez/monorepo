import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import type { DepcruiseVizData } from 'depcruise-viz';
import type { AllStoriesRunResult, StoryRunResult } from 'laymos/node';
import type { LaymosReport } from 'laymos/report';
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

/** A trace lookup failed because no stored spans have the requested trace id. */
export class TraceNotFound extends Schema.TaggedErrorClass<TraceNotFound>(
  'TraceNotFound',
)('TraceNotFound', {
  traceId: Schema.String,
}) {}

const DepcruiseData = Schema.Any as unknown as Schema.Codec<DepcruiseVizData>;

const RunDepcruiseSuccess = Schema.Union([
  Schema.Struct({ available: Schema.Literal(false) }),
  Schema.Struct({
    available: Schema.Literal(true),
    data: DepcruiseData,
  }),
]);

/** The `RunDepcruise` terminal payload (discriminated availability union). */
export type RunDepcruiseResult = typeof RunDepcruiseSuccess.Type;

const LaymosData = Schema.Any as unknown as Schema.Codec<LaymosReport>;

const RunLaymosSuccess = Schema.Union([
  Schema.Struct({ available: Schema.Literal(false) }),
  Schema.Struct({
    available: Schema.Literal(true),
    data: LaymosData,
  }),
]);

/** The `RunLaymos` terminal payload (discriminated availability union). */
export type RunLaymosResult = typeof RunLaymosSuccess.Type;

export const DepcruisePhase = Schema.Literals([
  'load-config',
  'compile-config',
  'cruise',
  'summarize',
]);

/**
 * Events streamed by `RunDepcruise`: `Progress` on each server-side phase
 * transition, `Heartbeat` roughly every second while the cruise runs, and a
 * terminal `Result` carrying the payload, after which the stream ends.
 */
export const DepcruiseEvent = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal('Progress'),
    phase: DepcruisePhase,
    message: Schema.String,
    elapsedMs: Schema.Number,
  }),
  Schema.Struct({
    _tag: Schema.Literal('Heartbeat'),
    elapsedMs: Schema.Number,
  }),
  Schema.Struct({
    _tag: Schema.Literal('Result'),
    result: RunDepcruiseSuccess,
  }),
]);

export type DepcruiseEvent = typeof DepcruiseEvent.Type;

/** Events streamed by `RunLaymos`: liveness heartbeats and one terminal result. */
export const LaymosEvent = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal('Heartbeat'),
    elapsedMs: Schema.Number,
  }),
  Schema.Struct({
    _tag: Schema.Literal('Result'),
    result: RunLaymosSuccess,
  }),
]);

export type LaymosEvent = typeof LaymosEvent.Type;

const AllStoriesRunData =
  Schema.Any as unknown as Schema.Codec<AllStoriesRunResult>;
const StoryRunData = Schema.Any as unknown as Schema.Codec<StoryRunResult>;
const StoryIdsData = Schema.Array(Schema.String);

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
 * the Dependencies procedures (`RunDepcruise` and `RunLaymos`, path-driven) and the global
 * Telemetry read procedures backed by lotel's orchestration. Telemetry
 * *ingestion* is served separately over OTLP/HTTP (see ADR 0001).
 */
export const DevtoolsRpc = RpcGroup.make(
  Rpc.make('RunDepcruise', {
    payload: { path: Schema.String },
    success: DepcruiseEvent,
    error: DevtoolsRpcError,
    stream: true,
  }),
  Rpc.make('RunLaymos', {
    payload: { path: Schema.String },
    success: LaymosEvent,
    error: DevtoolsRpcError,
    stream: true,
  }),
  Rpc.make('RunAllStories', {
    payload: { path: Schema.String },
    success: AllStoriesRunData,
    error: DevtoolsRpcError,
  }),
  Rpc.make('RunStory', {
    payload: { path: Schema.String, storyId: Schema.String },
    success: StoryRunData,
    error: DevtoolsRpcError,
  }),
  Rpc.make('DiscoverStoryIds', {
    payload: { path: Schema.String },
    success: StoryIdsData,
    error: DevtoolsRpcError,
  }),
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
