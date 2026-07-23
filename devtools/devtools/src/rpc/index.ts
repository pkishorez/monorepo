import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import type { StoryRunResult } from 'laymos/node';
import type { LaymosReport, StoryCollection } from 'laymos/report';
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

const StoryRunData = Schema.Any as unknown as Schema.Codec<StoryRunResult>;
const StoryCollectionData =
  Schema.Any as unknown as Schema.Codec<StoryCollection>;

const LaymosBootstrapData = Schema.Struct({
  architecture: LaymosData,
  stories: StoryCollectionData,
  files: Schema.Array(Schema.String),
});

const LaymosBootstrapSuccess = Schema.Union([
  Schema.Struct({ available: Schema.Literal(false) }),
  Schema.Struct({
    available: Schema.Literal(true),
    data: LaymosBootstrapData,
  }),
]);

export type LaymosBootstrapResult = typeof LaymosBootstrapSuccess.Type;

export const LaymosBootstrapEvent = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal('Heartbeat'),
    elapsedMs: Schema.Number,
  }),
  Schema.Struct({
    _tag: Schema.Literal('Result'),
    result: LaymosBootstrapSuccess,
  }),
]);

export type LaymosBootstrapEvent = typeof LaymosBootstrapEvent.Type;

/** Incremental progress and results emitted while running every Story. */
export const StoriesEvent = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal('Heartbeat'),
    elapsedMs: Schema.Number,
    storyId: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    _tag: Schema.Literal('StoryStarted'),
    storyId: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal('StoryResult'),
    storyId: Schema.String,
    result: StoryRunData,
  }),
  Schema.Struct({
    _tag: Schema.Literal('StoryError'),
    storyId: Schema.String,
    message: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal('Result'),
    status: Schema.Literals(['passed', 'failed']),
  }),
]);

export type StoriesEvent = typeof StoriesEvent.Type;

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

const StorySourceAnchorData = Schema.Struct({
  id: Schema.String,
  line: Schema.Number,
  column: Schema.Number,
  classification: Schema.optional(Schema.Literals(['narrated', 'omitted'])),
  reason: Schema.optional(Schema.String),
});

const StorySourceProjectionData = Schema.Struct({
  content: Schema.String,
  ranges: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      classification: Schema.Literals(['narrated', 'omitted', 'unnarrated']),
      reason: Schema.optional(Schema.String),
      start: Schema.Number,
      end: Schema.Number,
      startLine: Schema.Number,
      startColumn: Schema.Number,
      endLine: Schema.Number,
      endColumn: Schema.Number,
    }),
  ),
});

/**
 * The DevTools umbrella RPC surface consumed by the `/devtools` route. Carries
 * the Dependencies procedure (`RunLaymos`, path-driven) and the global
 * Telemetry read procedures backed by lotel's orchestration. Telemetry
 * *ingestion* is served separately over OTLP/HTTP (see ADR 0001).
 */
export const DevtoolsRpc = RpcGroup.make(
  Rpc.make('BootstrapLaymosProject', {
    payload: { path: Schema.String },
    success: LaymosBootstrapEvent,
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
    success: StoriesEvent,
    error: DevtoolsRpcError,
    stream: true,
  }),
  Rpc.make('RunStory', {
    payload: { path: Schema.String, storyId: Schema.String },
    success: StoryRunData,
    error: DevtoolsRpcError,
  }),
  Rpc.make('RunStoryGroup', {
    payload: { path: Schema.String, groupPath: Schema.Array(Schema.String) },
    success: StoriesEvent,
    error: DevtoolsRpcError,
    stream: true,
  }),
  Rpc.make('GetStories', {
    payload: { path: Schema.String },
    success: StoryCollectionData,
    error: DevtoolsRpcError,
  }),
  Rpc.make('ReadProjectFile', {
    payload: { path: Schema.String, filePath: Schema.String },
    success: Schema.Struct({
      filePath: Schema.String,
      content: Schema.String,
    }),
    error: DevtoolsRpcError,
  }),
  Rpc.make('ReadStorySource', {
    payload: {
      path: Schema.String,
      filePath: Schema.String,
      anchors: Schema.Array(StorySourceAnchorData),
    },
    success: Schema.Struct({
      filePath: Schema.String,
      source: Schema.String,
      ejected: StorySourceProjectionData,
      clean: StorySourceProjectionData,
    }),
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
