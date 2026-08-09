import { Effect } from 'effect';
import type { EntityType } from 'std-toolkit/core';
import { SQLiteTable, SqliteDB, SqliteDBError } from 'std-toolkit/sqlite';
import {
  LogEntitySchema,
  SpanEntitySchema,
  type LogRecord,
  type SpanRecord,
  type UpdateCursor,
} from '../../../domain/telemetry-schema/index.js';

interface TableService {
  setup(): Effect.Effect<void, SqliteDBError, SqliteDB>;
  dangerouslyRemoveAllItems(
    confirmation: 'I KNOW WHAT I AM DOING',
  ): Effect.Effect<{ itemsDeleted: number }, SqliteDBError, SqliteDB>;
}

interface SpanService {
  get(key: {
    traceId: string;
    spanId: string;
  }): Effect.Effect<EntityType<SpanRecord> | null, SqliteDBError, SqliteDB>;
  insert(
    record: SpanRecord,
  ): Effect.Effect<EntityType<SpanRecord>, SqliteDBError, SqliteDB>;
  getAndUpdate(
    key: { traceId: string; spanId: string },
    record: SpanRecord,
    config: { retries: number; lastWriteWins: boolean },
  ): Effect.Effect<EntityType<SpanRecord>, SqliteDBError, SqliteDB>;
  query(
    index: 'timeline',
    params: { pk: {}; sk: UpdateCursor },
    options?: { limit?: number },
  ): Effect.Effect<
    { items: EntityType<SpanRecord>[] },
    SqliteDBError,
    SqliteDB
  >;
  query(
    index: 'primary',
    params: { pk: { traceId: string }; sk: UpdateCursor },
  ): Effect.Effect<
    { items: EntityType<SpanRecord>[] },
    SqliteDBError,
    SqliteDB
  >;
}

interface LogService {
  insert(
    record: LogRecord,
  ): Effect.Effect<EntityType<LogRecord>, SqliteDBError, SqliteDB>;
  query(
    index: 'timeline',
    params: { pk: {}; sk: UpdateCursor },
    options?: { limit?: number },
  ): Effect.Effect<{ items: EntityType<LogRecord>[] }, SqliteDBError, SqliteDB>;
  query(
    index: 'byTrace',
    params: { pk: { traceId: string }; sk: UpdateCursor },
  ): Effect.Effect<{ items: EntityType<LogRecord>[] }, SqliteDBError, SqliteDB>;
}

interface SqliteEntities {
  table: TableService;
  spans: SpanService;
  logs: LogService;
}

export const makeSqliteEntities = (): SqliteEntities => {
  const table = SQLiteTable.make()
    .primary('pk', 'sk')
    .index('timeline', 'timelinePk', 'timelineSk')
    .index('trace', 'tracePk', 'traceSk')
    .build();

  const spans = table
    .entity(SpanEntitySchema)
    .primary({ pk: ['traceId'] })
    .index('timeline', 'timeline', { pk: [] })
    .build();

  const logs = table
    .entity(LogEntitySchema)
    .primary()
    .index('timeline', 'timeline', { pk: [] })
    .index('trace', 'byTrace', { pk: ['traceId'] })
    .build();

  return { table, spans, logs };
};
