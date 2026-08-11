import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Context, Effect, Layer } from 'effect';
import { SqliteDB } from 'std-toolkit/sqlite';
import { nodeSqliteLayer } from 'std-toolkit/sqlite/adapters/node';
import type { TelemetryStoreShape } from '../telemetry-store.js';
import { TelemetryStoreError } from '../telemetry-store.js';
import { prepareFlowLog, prepareFlowSpan } from '../../../domain/flow/index.js';
import { makeSqliteEntities } from './entities.js';
import { writeFlowRecord } from './flow-write.js';

const TABLE_NAME = 'lotel_data';

const storeError = (operation: string, cause: unknown) =>
  new TelemetryStoreError({ operation, cause: String(cause) });

const databaseLayer = (path: string) => {
  const database = Effect.acquireRelease(
    Effect.try({
      try: () => {
        if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
        return new DatabaseSync(path);
      },
      catch: (cause) => storeError('open', cause),
    }),
    (connection) =>
      Effect.sync(() => {
        connection.close();
      }),
  );

  return Layer.effect(
    SqliteDB,
    database.pipe(
      Effect.flatMap((connection) =>
        Layer.build(nodeSqliteLayer(connection, TABLE_NAME)),
      ),
      Effect.map((context) => Context.getUnsafe(context, SqliteDB)),
    ),
  );
};

const countResults = (results: boolean[]) => {
  const accepted = results.filter(Boolean).length;
  return { accepted, rejected: results.length - accepted };
};

export const makeSqliteTelemetryStore = Effect.gen(function* () {
  const { table, spans, logs, flows } = makeSqliteEntities();
  const sqlite = yield* SqliteDB;
  const provideSqlite = <A, E>(effect: Effect.Effect<A, E, SqliteDB>) =>
    Effect.provideService(effect, SqliteDB, sqlite);

  yield* table
    .setup()
    .pipe(Effect.mapError((cause) => storeError('setup', cause)));

  return {
    saveSpans: (records) =>
      Effect.forEach(records, (record) => {
        const prepared = prepareFlowSpan(record);
        const indexed = prepared.record;
        return provideSqlite(
          spans.get({ traceId: record.traceId, spanId: record.spanId }).pipe(
            Effect.flatMap((existing) =>
              writeFlowRecord(
                { table, flows },
                {
                  flowId: indexed.flowId,
                  latestTimeUnixNano: prepared.latestTimeUnixNano,
                  recordOperation: existing
                    ? spans.getAndUpdateOp(
                        { traceId: record.traceId, spanId: record.spanId },
                        indexed,
                        { lastWriteWins: true },
                      )
                    : spans.insertOp(indexed),
                },
              ),
            ),
            Effect.as(true),
            Effect.catch(() => Effect.succeed(false)),
          ),
        );
      }).pipe(Effect.map(countResults)),

    insertLogs: (records) =>
      Effect.forEach(records, (record) => {
        const prepared = prepareFlowLog(record);
        const indexed = prepared.record;
        return provideSqlite(
          writeFlowRecord(
            { table, flows },
            {
              flowId: indexed.flowId,
              latestTimeUnixNano: prepared.latestTimeUnixNano,
              terminalStatus: prepared.terminalStatus,
              recordOperation: logs.insertOp(indexed),
            },
          ),
        ).pipe(
          Effect.as(true),
          Effect.catch(() => Effect.succeed(false)),
        );
      }).pipe(Effect.map(countResults)),

    listSpans: (_u, limit) =>
      provideSqlite(
        spans
          .query(
            'timeline',
            { pk: {}, sk: _u },
            limit === undefined ? undefined : { limit },
          )
          .pipe(Effect.mapError((cause) => storeError('listSpans', cause))),
      ),

    listLogs: (_u, limit) =>
      provideSqlite(
        logs
          .query(
            'timeline',
            { pk: {}, sk: _u },
            limit === undefined ? undefined : { limit },
          )
          .pipe(Effect.mapError((cause) => storeError('listLogs', cause))),
      ),

    listFlows: (_u, limit) =>
      provideSqlite(
        flows
          .query(
            'timeline',
            { pk: {}, sk: _u },
            limit === undefined ? undefined : { limit },
          )
          .pipe(Effect.mapError((cause) => storeError('listFlows', cause))),
      ),

    findSpansByTrace: (traceId) =>
      provideSqlite(
        spans
          .query('primary', {
            pk: { traceId },
            sk: { '>': null },
          })
          .pipe(
            Effect.map(({ items }) => items),
            Effect.mapError((cause) => storeError('findSpansByTrace', cause)),
          ),
      ),

    findLogsByTrace: (traceId) =>
      provideSqlite(
        logs
          .query('byTrace', {
            pk: { traceId },
            sk: { '>': null },
          })
          .pipe(
            Effect.map(({ items }) => items),
            Effect.mapError((cause) => storeError('findLogsByTrace', cause)),
          ),
      ),

    findFlow: (flowId) =>
      provideSqlite(
        flows
          .get({ flowId })
          .pipe(Effect.mapError((cause) => storeError('findFlow', cause))),
      ),

    findSpansByFlow: (flowId) =>
      provideSqlite(
        spans
          .query('byFlow', { pk: { flowId }, sk: { '>': null } }, { limit: -1 })
          .pipe(
            Effect.map(({ items }) => items),
            Effect.mapError((cause) => storeError('findSpansByFlow', cause)),
          ),
      ),

    findLogsByFlow: (flowId) =>
      provideSqlite(
        logs
          .query('byFlow', { pk: { flowId }, sk: { '>': null } }, { limit: -1 })
          .pipe(
            Effect.map(({ items }) => items),
            Effect.mapError((cause) => storeError('findLogsByFlow', cause)),
          ),
      ),

    clearTelemetry: provideSqlite(
      table.dangerouslyRemoveAllItems('I KNOW WHAT I AM DOING').pipe(
        Effect.map(({ itemsDeleted }) => itemsDeleted),
        Effect.mapError((cause) => storeError('clearTelemetry', cause)),
      ),
    ),
  } satisfies TelemetryStoreShape;
});

export const sqliteTelemetryStoreDependencies = (path: string) =>
  databaseLayer(path);
