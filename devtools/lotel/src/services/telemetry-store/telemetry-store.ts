import { Context, Data, Effect, Layer } from 'effect';
import type { DecodedEntity } from 'std-toolkit/core';
import type {
  LogRecord,
  SpanRecord,
  UpdateCursor,
} from '../../domain/telemetry-schema/index.js';
import { FlowEntitySchema } from '../../domain/flow/index.js';
import { makeSqliteTelemetryStore } from './sqlite/index.js';

type FlowEntity = typeof FlowEntitySchema.Type;

interface BatchWriteResult {
  accepted: number;
  rejected: number;
}

export class TelemetryStoreError extends Data.TaggedError(
  'TelemetryStoreError',
)<{
  operation: string;
  cause: string;
}> {}

export interface TelemetryStoreShape {
  saveSpans(
    records: ReadonlyArray<SpanRecord>,
  ): Effect.Effect<BatchWriteResult>;
  insertLogs(
    records: ReadonlyArray<LogRecord>,
  ): Effect.Effect<BatchWriteResult>;
  listSpans(
    _u: UpdateCursor,
    limit?: number,
  ): Effect.Effect<{ items: DecodedEntity<SpanRecord>[] }, TelemetryStoreError>;
  listLogs(
    _u: UpdateCursor,
    limit?: number,
  ): Effect.Effect<{ items: DecodedEntity<LogRecord>[] }, TelemetryStoreError>;
  listFlows(
    _u: UpdateCursor,
    limit?: number,
  ): Effect.Effect<{ items: DecodedEntity<FlowEntity>[] }, TelemetryStoreError>;
  findSpansByTrace(
    traceId: string,
  ): Effect.Effect<DecodedEntity<SpanRecord>[], TelemetryStoreError>;
  findLogsByTrace(
    traceId: string,
  ): Effect.Effect<DecodedEntity<LogRecord>[], TelemetryStoreError>;
  findFlow(
    flowId: string,
  ): Effect.Effect<DecodedEntity<FlowEntity> | null, TelemetryStoreError>;
  findSpansByFlow(
    flowId: string,
  ): Effect.Effect<DecodedEntity<SpanRecord>[], TelemetryStoreError>;
  findLogsByFlow(
    flowId: string,
  ): Effect.Effect<DecodedEntity<LogRecord>[], TelemetryStoreError>;
  clearTelemetry: Effect.Effect<number, TelemetryStoreError>;
}

export class TelemetryStore extends Context.Service<
  TelemetryStore,
  TelemetryStoreShape
>()('lotel/TelemetryStore') {}

export const sqliteTelemetryStoreLayer = ({ path }: { path: string }) =>
  Layer.effect(TelemetryStore, makeSqliteTelemetryStore(path));
