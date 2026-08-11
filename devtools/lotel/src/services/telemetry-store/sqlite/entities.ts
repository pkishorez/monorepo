import { Effect } from 'effect';
import type { EntityType } from 'std-toolkit/core';
import {
  SQLiteTable,
  SqliteDB,
  SqliteDBError,
  type SqliteEntityOp,
} from 'std-toolkit/sqlite';
import {
  LogEntitySchema,
  SpanEntitySchema,
  type LogRecord,
  type SpanRecord,
  type UpdateCursor,
} from '../../../domain/telemetry-schema/index.js';
import { FlowEntitySchema } from '../../../domain/flow/index.js';

type FlowEntity = typeof FlowEntitySchema.Type;

interface TableService {
  setup(): Effect.Effect<void, SqliteDBError, SqliteDB>;
  dangerouslyRemoveAllItems(
    confirmation: 'I KNOW WHAT I AM DOING',
  ): Effect.Effect<{ itemsDeleted: number }, SqliteDBError, SqliteDB>;
  transact(
    operations: ReadonlyArray<SqliteEntityOp>,
  ): Effect.Effect<EntityType<unknown>[], SqliteDBError, SqliteDB>;
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
  insertOp(
    record: SpanRecord,
  ): Effect.Effect<SqliteEntityOp, SqliteDBError, SqliteDB>;
  getAndUpdateOp(
    key: { traceId: string; spanId: string },
    record: SpanRecord,
    options?: { lastWriteWins?: boolean },
  ): Effect.Effect<SqliteEntityOp, SqliteDBError, SqliteDB>;
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
    options?: { limit?: number },
  ): Effect.Effect<
    { items: EntityType<SpanRecord>[] },
    SqliteDBError,
    SqliteDB
  >;
  query(
    index: 'byFlow',
    params: { pk: { flowId: string }; sk: UpdateCursor },
    options?: { limit?: number },
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
  insertOp(
    record: LogRecord,
  ): Effect.Effect<SqliteEntityOp, SqliteDBError, SqliteDB>;
  query(
    index: 'timeline',
    params: { pk: {}; sk: UpdateCursor },
    options?: { limit?: number },
  ): Effect.Effect<{ items: EntityType<LogRecord>[] }, SqliteDBError, SqliteDB>;
  query(
    index: 'byTrace',
    params: { pk: { traceId: string }; sk: UpdateCursor },
    options?: { limit?: number },
  ): Effect.Effect<{ items: EntityType<LogRecord>[] }, SqliteDBError, SqliteDB>;
  query(
    index: 'byFlow',
    params: { pk: { flowId: string }; sk: UpdateCursor },
    options?: { limit?: number },
  ): Effect.Effect<{ items: EntityType<LogRecord>[] }, SqliteDBError, SqliteDB>;
}

interface FlowService {
  get(key: {
    flowId: string;
  }): Effect.Effect<EntityType<FlowEntity> | null, SqliteDBError, SqliteDB>;
  insertOp(
    record: FlowEntity,
  ): Effect.Effect<SqliteEntityOp, SqliteDBError, SqliteDB>;
  getAndUpdateOp(
    key: { flowId: string },
    record: FlowEntity | ((current: FlowEntity) => FlowEntity),
    options?: { lastWriteWins?: boolean },
  ): Effect.Effect<SqliteEntityOp, SqliteDBError, SqliteDB>;
  query(
    index: 'timeline',
    params: { pk: {}; sk: UpdateCursor },
    options?: { limit?: number },
  ): Effect.Effect<
    { items: EntityType<FlowEntity>[] },
    SqliteDBError,
    SqliteDB
  >;
}

interface SqliteEntities {
  table: TableService;
  spans: SpanService;
  logs: LogService;
  flows: FlowService;
}

export const makeSqliteEntities = (): SqliteEntities => {
  const table = SQLiteTable.make()
    .primary('pk', 'sk')
    .index('timeline', 'timelinePk', 'timelineSk')
    .index('trace', 'tracePk', 'traceSk')
    .index('flow', 'flowPk', 'flowSk')
    .build();

  const spans = table
    .entity(SpanEntitySchema)
    .primary({ pk: ['traceId'] })
    .index('timeline', 'timeline', { pk: [] })
    .index('flow', 'byFlow', { pk: ['flowId'] })
    .build();

  const logs = table
    .entity(LogEntitySchema)
    .primary()
    .index('timeline', 'timeline', { pk: [] })
    .index('trace', 'byTrace', { pk: ['traceId'] })
    .index('flow', 'byFlow', { pk: ['flowId'] })
    .build();

  const flows = table
    .entity(FlowEntitySchema)
    .primary()
    .index('timeline', 'timeline', { pk: [] })
    .build();

  return { table, spans, logs, flows };
};
