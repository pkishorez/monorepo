import { Context, Data, type Effect } from 'effect';
import type { Entity } from '@kestack/std-toolkit/core';
import type {
  LogRecord,
  NewLogRecord,
  NewSpanRecord,
  SpanRecord,
  UpdateCursor,
} from '../../../rpc/telemetry/contract/index.js';

export class TelemetryStoreError extends Data.TaggedError(
  'TelemetryStoreError',
)<{
  operation: string;
  cause: string;
}> {}

export class TelemetryStore extends Context.Service<
  TelemetryStore,
  TelemetryStoreShape
>()('Lotel/server/TelemetryStore') {}

export interface BatchWriteResult {
  accepted: number;
  rejected: number;
}
export interface TelemetryStoreShape {
  saveSpans(
    records: ReadonlyArray<NewSpanRecord>,
  ): Effect.Effect<BatchWriteResult>;
  insertLogs(
    records: ReadonlyArray<NewLogRecord>,
  ): Effect.Effect<BatchWriteResult>;
  listSpans(
    _u: UpdateCursor,
    limit?: number,
  ): Effect.Effect<{ items: Entity<SpanRecord>[] }, TelemetryStoreError>;
  listLogs(
    _u: UpdateCursor,
    limit?: number,
  ): Effect.Effect<{ items: Entity<LogRecord>[] }, TelemetryStoreError>;
  listRecentTraceIds(
    limit: number,
  ): Effect.Effect<string[], TelemetryStoreError>;
  findSpansByTrace(
    traceId: string,
  ): Effect.Effect<Entity<SpanRecord>[], TelemetryStoreError>;
  findLogsByTrace(
    traceId: string,
  ): Effect.Effect<Entity<LogRecord>[], TelemetryStoreError>;
  clearTelemetry: Effect.Effect<number, TelemetryStoreError>;
}
