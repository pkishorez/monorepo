import { Context, Data, type Effect } from 'effect';
import type { Entity } from '@kestack/std-toolkit/core';
import type {
  LogRecord,
  NewLogRecord,
  NewSpanRecord,
  SpanRecord,
  UpdateCursor,
} from '../../../rpc/telemetry/contract/index.js';

/*
 * Where the server keeps Span Records and Log Records. Both doors write
 * through it, OTLP ingestion and the RPC alike: Span Records are kept by
 * their identity, so a completed Span replaces its Provisional Span Record;
 * each Log Record gets its own Log Record ID, so two identical ones stay two.
 */

export interface BatchWriteResult {
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
  /** Keeps Span Records, replacing any with the same trace ID and span ID. */
  saveSpans(
    records: ReadonlyArray<NewSpanRecord>,
  ): Effect.Effect<BatchWriteResult>;
  /** Keeps Log Records, each under a Log Record ID of its own. */
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
  /** Trace IDs ordered from most recently updated Span to oldest. */
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

export class TelemetryStore extends Context.Service<
  TelemetryStore,
  TelemetryStoreShape
>()('Lotel/server/TelemetryStore') {}
