import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import type {
  LaymosReport,
  ProjectNarrative,
  TestsReport,
} from 'laymos/report';
import { TestsReportSchema } from 'laymos/report';
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

const TestsReportData =
  TestsReportSchema as unknown as Schema.Codec<TestsReport>;
const ProjectNarrativeData =
  Schema.Any as unknown as Schema.Codec<ProjectNarrative>;

export interface LaymosModuleDocumentation {
  readonly modulePath: string;
  readonly description: string;
  readonly documentation?: string;
}

export interface LaymosProjectDocumentation {
  readonly modules: readonly LaymosModuleDocumentation[];
}

const LaymosProjectDocumentationData =
  Schema.Any as unknown as Schema.Codec<LaymosProjectDocumentation>;

const LaymosProjectData = Schema.Struct({
  architecture: LaymosData,
  documentation: LaymosProjectDocumentationData,
  files: Schema.Array(Schema.String),
});

const OpenLaymosProjectSuccess = Schema.Union([
  Schema.Struct({ available: Schema.Literal(false) }),
  Schema.Struct({
    available: Schema.Literal(true),
    data: LaymosProjectData,
  }),
]);

export type OpenLaymosProjectResult = typeof OpenLaymosProjectSuccess.Type;

export const OpenLaymosProjectEvent = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal('Heartbeat'),
    elapsedMs: Schema.Number,
  }),
  Schema.Struct({
    _tag: Schema.Literal('Architecture'),
    architecture: LaymosData,
  }),
  Schema.Struct({
    _tag: Schema.Literal('Project'),
    project: Schema.optional(ProjectNarrativeData),
  }),
  Schema.Struct({
    _tag: Schema.Literal('Result'),
    result: OpenLaymosProjectSuccess,
  }),
]);

export type OpenLaymosProjectEvent = typeof OpenLaymosProjectEvent.Type;

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
 * the project-centric Laymos procedures and the global Telemetry read
 * procedures backed by lotel's orchestration. Telemetry
 * *ingestion* is served separately over OTLP/HTTP (see ADR 0001).
 */
export const DevtoolsRpc = RpcGroup.make(
  Rpc.make('OpenLaymosProject', {
    payload: { path: Schema.String },
    success: OpenLaymosProjectEvent,
    error: DevtoolsRpcError,
    stream: true,
  }),
  Rpc.make('RunTests', {
    payload: {
      path: Schema.String,
      files: Schema.optional(Schema.Array(Schema.String)),
      testNamePattern: Schema.optional(Schema.String),
    },
    success: TestsReportData,
    error: DevtoolsRpcError,
  }),
  Rpc.make('ReadProjectFile', {
    payload: {
      path: Schema.String,
      filePath: Schema.String,
      testName: Schema.optional(Schema.String),
    },
    success: Schema.Struct({
      filePath: Schema.String,
      content: Schema.String,
      highlight: Schema.optional(
        Schema.Struct({
          startLine: Schema.Number,
          endLine: Schema.Number,
        }),
      ),
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
