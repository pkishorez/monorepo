import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Effect, Layer } from 'effect';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import type { TelemetryStoreShape } from '../telemetry-store.js';
import { TelemetryStoreError } from '../telemetry-store.js';
import { prepareFlowLog, prepareFlowSpan } from '../../../domain/flow/index.js';
import { makeSqliteEntities } from './entities.js';
import { writeFlowRecord } from './flow-write.js';
import type { UpdateCursor } from '../../../domain/telemetry-schema/index.js';

const storeError = (operation: string, cause: unknown) =>
  new TelemetryStoreError({ operation, cause: String(cause) });

const countResults = (results: boolean[]) => {
  const accepted = results.filter(Boolean).length;
  return { accepted, rejected: results.length - accepted };
};

const cursorCondition = (cursor: UpdateCursor) => {
  if ('>' in cursor)
    return { '>': cursor['>'] === null ? null : { _u: cursor['>'] } } as const;
  if ('>=' in cursor)
    return {
      '>=': cursor['>='] === null ? null : { _u: cursor['>='] },
    } as const;
  if ('<' in cursor)
    return { '<': cursor['<'] === null ? null : { _u: cursor['<'] } } as const;
  return { '<=': cursor['<='] === null ? null : { _u: cursor['<='] } } as const;
};

const mutablePage = <T>(page: { readonly items: readonly T[] }) => ({
  items: [...page.items],
});

const collectPages = <T, E, R>(
  query: (
    after?: T,
  ) => Effect.Effect<
    { readonly items: readonly T[]; readonly hasMore: boolean },
    E,
    R
  >,
) =>
  Effect.gen(function* () {
    const items: T[] = [];
    let after: T | undefined;
    for (;;) {
      const page = yield* query(after);
      items.push(...page.items);
      const last = page.items.at(-1);
      if (!page.hasMore || last === undefined) break;
      after = last;
    }
    return { items };
  });

const readPages = <T, E, R>(
  query: (options?: {
    readonly limit?: number;
    readonly after?: T;
  }) => Effect.Effect<
    { readonly items: readonly T[]; readonly hasMore: boolean },
    E,
    R
  >,
  limit?: number,
): Effect.Effect<{ items: T[] }, E, R> =>
  limit === undefined
    ? collectPages((after) =>
        query(after === undefined ? undefined : { after }),
      )
    : query({ limit }).pipe(Effect.map(mutablePage));

export const makeSqliteTelemetryStore = (path: string) =>
  Effect.gen(function* () {
    const database = yield* Effect.acquireRelease(
      Effect.try({
        try: () => {
          if (path !== ':memory:')
            mkdirSync(dirname(path), { recursive: true });
          return makeNodeSQLite({ path });
        },
        catch: (cause) => storeError('open', cause),
      }),
      (driver) => Effect.sync(() => driver.close?.()),
    );
    const { table, spans, logs, flows, layer, setup } =
      makeSqliteEntities(database);
    type SpanQueryOptions = NonNullable<Parameters<typeof spans.query>[2]>;
    type LogQueryOptions = NonNullable<Parameters<typeof logs.query>[2]>;
    type FlowQueryOptions = NonNullable<Parameters<typeof flows.query>[2]>;
    const provideSqlite = <A, E>(
      effect: Effect.Effect<A, E, Layer.Success<typeof layer>>,
    ) => Effect.provide(effect, layer);

    yield* setup.pipe(Effect.mapError((cause) => storeError('setup', cause)));

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
          readPages(
            (options?: SpanQueryOptions) =>
              spans.query(
                'timeline',
                { pk: {}, ...cursorCondition(_u) },
                options,
              ),
            limit,
          ).pipe(Effect.mapError((cause) => storeError('listSpans', cause))),
        ),

      listLogs: (_u, limit) =>
        provideSqlite(
          readPages(
            (options?: LogQueryOptions) =>
              logs.query(
                'timeline',
                { pk: {}, ...cursorCondition(_u) },
                options,
              ),
            limit,
          ).pipe(Effect.mapError((cause) => storeError('listLogs', cause))),
        ),

      listFlows: (_u, limit) =>
        provideSqlite(
          readPages(
            (options?: FlowQueryOptions) =>
              flows.query(
                'timeline',
                { pk: {}, ...cursorCondition(_u) },
                options,
              ),
            limit,
          ).pipe(Effect.mapError((cause) => storeError('listFlows', cause))),
        ),

      findSpansByTrace: (traceId) =>
        provideSqlite(
          readPages((options?: SpanQueryOptions) =>
            spans.query('byTrace', { pk: { traceId }, '>': null }, options),
          ).pipe(
            Effect.map(({ items }) => [...items]),
            Effect.mapError((cause) => storeError('findSpansByTrace', cause)),
          ),
        ),

      findLogsByTrace: (traceId) =>
        provideSqlite(
          readPages((options?: LogQueryOptions) =>
            logs.query('byTrace', { pk: { traceId }, '>': null }, options),
          ).pipe(
            Effect.map(({ items }) => [...items]),
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
          readPages((options?: SpanQueryOptions) =>
            spans.query('byFlow', { pk: { flowId }, '>': null }, options),
          ).pipe(
            Effect.map(({ items }) => [...items]),
            Effect.mapError((cause) => storeError('findSpansByFlow', cause)),
          ),
        ),

      findLogsByFlow: (flowId) =>
        provideSqlite(
          readPages((options?: LogQueryOptions) =>
            logs.query('byFlow', { pk: { flowId }, '>': null }, options),
          ).pipe(
            Effect.map(({ items }) => [...items]),
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
