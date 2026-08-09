import { Context, Data, Effect, Layer } from 'effect';
import type { EntityType } from 'std-toolkit/core';
import type {
  LogRecord,
  SpanRecord,
  UpdateCursor,
} from '../../domain/telemetry-schema/index.js';
import {
  makeSqliteTelemetryStore,
  sqliteTelemetryStoreDependencies,
} from './sqlite/index.js';

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
  ): Effect.Effect<{ items: EntityType<SpanRecord>[] }, TelemetryStoreError>;
  listLogs(
    _u: UpdateCursor,
    limit?: number,
  ): Effect.Effect<{ items: EntityType<LogRecord>[] }, TelemetryStoreError>;
  findSpansByTrace(
    traceId: string,
  ): Effect.Effect<EntityType<SpanRecord>[], TelemetryStoreError>;
  findLogsByTrace(
    traceId: string,
  ): Effect.Effect<EntityType<LogRecord>[], TelemetryStoreError>;
  clearTelemetry: Effect.Effect<number, TelemetryStoreError>;
}

export class TelemetryStore extends Context.Service<
  TelemetryStore,
  TelemetryStoreShape
>()('lotel/TelemetryStore') {}

export const sqliteTelemetryStoreLayer = ({ path }: { path: string }) =>
  Layer.effect(TelemetryStore, makeSqliteTelemetryStore).pipe(
    Layer.provide(sqliteTelemetryStoreDependencies(path)),
  );
