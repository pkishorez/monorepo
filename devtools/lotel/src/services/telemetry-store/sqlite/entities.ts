import { Effect, type Layer } from 'effect';
import type { EntityType } from 'std-toolkit/core';
import {
  SQLiteError,
  SQLiteTable,
  type SqliteEntityOp,
} from 'std-toolkit/sqlite';
import type { nodeSqliteLayer } from 'std-toolkit/sqlite/adapters/node';
import {
  LogEntitySchema,
  SpanEntitySchema,
  type LogRecord,
  type SpanRecord,
  type UpdateCursor,
} from '../../../domain/telemetry-schema/index.js';
import { FlowEntitySchema } from '../../../domain/flow/index.js';

type FlowEntity = typeof FlowEntitySchema.Type;

type SQLiteDatabase = Layer.Success<ReturnType<typeof nodeSqliteLayer>>;

interface TableService {
  setup(): Effect.Effect<void, SQLiteError, SQLiteDatabase>;
  dangerouslyRemoveAllItems(
    confirmation: 'I KNOW WHAT I AM DOING',
  ): Effect.Effect<{ itemsDeleted: number }, SQLiteError, SQLiteDatabase>;
  transact(
    operations: ReadonlyArray<SqliteEntityOp>,
  ): Effect.Effect<EntityType<unknown>[], SQLiteError, SQLiteDatabase>;
}

interface SpanService {
  get(key: {
    traceId: string;
    spanId: string;
  }): Effect.Effect<EntityType<SpanRecord> | null, SQLiteError, SQLiteDatabase>;
  insert(
    record: SpanRecord,
  ): Effect.Effect<EntityType<SpanRecord>, SQLiteError, SQLiteDatabase>;
  getAndUpdate(
    key: { traceId: string; spanId: string },
    record: SpanRecord,
    config: { retries: number; lastWriteWins: boolean },
  ): Effect.Effect<EntityType<SpanRecord>, SQLiteError, SQLiteDatabase>;
  insertOp(
    record: SpanRecord,
  ): Effect.Effect<SqliteEntityOp, SQLiteError, SQLiteDatabase>;
  getAndUpdateOp(
    key: { traceId: string; spanId: string },
    record: SpanRecord,
    options?: { lastWriteWins?: boolean },
  ): Effect.Effect<SqliteEntityOp, SQLiteError, SQLiteDatabase>;
  query(
    index: 'timeline',
    params: { pk: {}; sk: UpdateCursor },
    options?: { limit?: number },
  ): Effect.Effect<
    { items: EntityType<SpanRecord>[] },
    SQLiteError,
    SQLiteDatabase
  >;
  query(
    index: 'primary',
    params: { pk: { traceId: string }; sk: UpdateCursor },
    options?: { limit?: number },
  ): Effect.Effect<
    { items: EntityType<SpanRecord>[] },
    SQLiteError,
    SQLiteDatabase
  >;
  query(
    index: 'byFlow',
    params: { pk: { flowId: string }; sk: UpdateCursor },
    options?: { limit?: number },
  ): Effect.Effect<
    { items: EntityType<SpanRecord>[] },
    SQLiteError,
    SQLiteDatabase
  >;
}

interface LogService {
  insert(
    record: LogRecord,
  ): Effect.Effect<EntityType<LogRecord>, SQLiteError, SQLiteDatabase>;
  insertOp(
    record: LogRecord,
  ): Effect.Effect<SqliteEntityOp, SQLiteError, SQLiteDatabase>;
  query(
    index: 'timeline',
    params: { pk: {}; sk: UpdateCursor },
    options?: { limit?: number },
  ): Effect.Effect<
    { items: EntityType<LogRecord>[] },
    SQLiteError,
    SQLiteDatabase
  >;
  query(
    index: 'byTrace',
    params: { pk: { traceId: string }; sk: UpdateCursor },
    options?: { limit?: number },
  ): Effect.Effect<
    { items: EntityType<LogRecord>[] },
    SQLiteError,
    SQLiteDatabase
  >;
  query(
    index: 'byFlow',
    params: { pk: { flowId: string }; sk: UpdateCursor },
    options?: { limit?: number },
  ): Effect.Effect<
    { items: EntityType<LogRecord>[] },
    SQLiteError,
    SQLiteDatabase
  >;
}

interface FlowService {
  get(key: {
    flowId: string;
  }): Effect.Effect<EntityType<FlowEntity> | null, SQLiteError, SQLiteDatabase>;
  insertOp(
    record: FlowEntity,
  ): Effect.Effect<SqliteEntityOp, SQLiteError, SQLiteDatabase>;
  getAndUpdateOp(
    key: { flowId: string },
    record: FlowEntity | ((current: FlowEntity) => FlowEntity),
    options?: { lastWriteWins?: boolean },
  ): Effect.Effect<SqliteEntityOp, SQLiteError, SQLiteDatabase>;
  query(
    index: 'timeline',
    params: { pk: {}; sk: UpdateCursor },
    options?: { limit?: number },
  ): Effect.Effect<
    { items: EntityType<FlowEntity>[] },
    SQLiteError,
    SQLiteDatabase
  >;
}

interface SqliteEntities {
  table: TableService;
  spans: SpanService;
  logs: LogService;
  flows: FlowService;
}

export const makeSqliteEntities = (): SqliteEntities => {
  const table = SQLiteTable.make('lotel_data')
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
