import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Context, Data, Effect, Layer } from 'effect';
import type { Entry } from '@pkishorez/flow';
import { FlowRpc, FlowRpcError, type FlowCursor } from '@pkishorez/flow/rpc';
import type { DecodedEntity } from 'std-toolkit/core';
import { StdTable } from 'std-toolkit/db';
import { SQLite, type SQLiteDriver } from 'std-toolkit/db/sqlite';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import {
  FlowEntryEntitySchema,
  type FlowEntryRecord,
} from '../../rpc/index.js';

export class FlowStoreError extends Data.TaggedError('FlowStoreError')<{
  operation: string;
  cause: string;
}> {}

export interface FlowStoreShape {
  /** Writes Entries in the order given; each gets the store's next `_u`. */
  writeEntries(
    entries: ReadonlyArray<Entry>,
  ): Effect.Effect<{ accepted: number; rejected: number }>;
  listEntries(
    _u: FlowCursor,
    limit?: number,
  ): Effect.Effect<{ items: DecodedEntity<FlowEntryRecord>[] }, FlowStoreError>;
  clearFlows: Effect.Effect<number, FlowStoreError>;
}

/** The DevTools Flow Store: every Entry of every Flow, in write order. */
export class FlowStore extends Context.Service<FlowStore, FlowStoreShape>()(
  'devtools/FlowStore',
) {}

const table = StdTable.make('flow')
  .primary('pk', 'sk')
  .gsi('timeline', 'timelinePk', 'timelineSk')
  .gsi('flow', 'flowPk', 'flowSk')
  .build();

const entries = table
  .entity(FlowEntryEntitySchema)
  .primary()
  .index('timeline', 'timeline', { pk: [] })
  .index('flow', 'byFlow', { pk: ['flowId'] })
  .build();

const storeError = (operation: string, cause: unknown) =>
  new FlowStoreError({ operation, cause: String(cause) });

const cursorCondition = (cursor: FlowCursor) => {
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

/** Opens the Flow Store on one SQLite database; the Lotel tables may share the file. */
export const makeSqliteFlowStore = (options: {
  readonly path: string;
  readonly driver?: SQLiteDriver | undefined;
}) =>
  Effect.gen(function* () {
    const database =
      options.driver ??
      (yield* Effect.acquireRelease(
        Effect.try({
          try: () => {
            if (options.path !== ':memory:')
              mkdirSync(dirname(options.path), { recursive: true });
            return makeNodeSQLite({ path: options.path });
          },
          catch: (cause) => storeError('open', cause),
        }),
        (driver) => Effect.sync(() => driver.close?.()),
      ));
    const configured = SQLite.make(table, {
      database,
      tableName: 'flow_data',
    });
    type QueryOptions = NonNullable<Parameters<typeof entries.query>[2]>;
    const provideSqlite = <A, E>(
      effect: Effect.Effect<A, E, Layer.Success<typeof configured.layer>>,
    ) => Effect.provide(effect, configured.layer);

    yield* SQLite.setup(table, { database, tableName: 'flow_data' }).pipe(
      Effect.mapError((cause) => storeError('setup', cause)),
    );

    const shape: FlowStoreShape = {
      writeEntries: (batch) =>
        Effect.forEach(
          batch,
          (entry) =>
            provideSqlite(
              entries.insert({ id: entry.id, flowId: entry.flowId, entry }),
            ).pipe(
              Effect.as(true),
              Effect.catch(() => Effect.succeed(false)),
            ),
          { concurrency: 1 },
        ).pipe(
          Effect.map((results) => {
            const accepted = results.filter(Boolean).length;
            return { accepted, rejected: results.length - accepted };
          }),
        ),
      listEntries: (_u, limit) =>
        provideSqlite(
          limit === undefined
            ? collectPages((after?: DecodedEntity<FlowEntryRecord>) =>
                entries.query(
                  'timeline',
                  { pk: {}, ...cursorCondition(_u) },
                  after === undefined ? undefined : { after },
                ),
              )
            : entries
                .query('timeline', { pk: {}, ...cursorCondition(_u) }, {
                  limit,
                } satisfies QueryOptions)
                .pipe(Effect.map((page) => ({ items: [...page.items] }))),
        ).pipe(Effect.mapError((cause) => storeError('listEntries', cause))),
      clearFlows: provideSqlite(
        table.dangerouslyRemoveAllItems('I KNOW WHAT I AM DOING').pipe(
          Effect.map(({ itemsDeleted }) => itemsDeleted),
          Effect.mapError((cause) => storeError('clearFlows', cause)),
        ),
      ),
    };
    return shape;
  });

export const sqliteFlowStoreLayer = (options: { readonly path: string }) =>
  Layer.effect(FlowStore, makeSqliteFlowStore(options));

const toRpcError = (cause: unknown) =>
  new FlowRpcError({
    message:
      cause instanceof FlowStoreError
        ? `${cause.operation}: ${cause.cause}`
        : String(cause),
  });

/** Fulfils the Flow RPC contract with the Flow Store. */
export const FlowRpcLive = FlowRpc.toLayer({
  WriteFlowEntries: ({ entries: batch }) =>
    Effect.flatMap(FlowStore, (store) => store.writeEntries(batch)),
  ListFlowEntries: ({ _u, limit }) =>
    Effect.flatMap(FlowStore, (store) => store.listEntries(_u, limit)).pipe(
      Effect.map(({ items }) => ({
        items: items.map((item) => ({
          entry: item.value.entry,
          _u: item.meta._u,
        })),
      })),
      Effect.mapError(toRpcError),
    ),
  ClearFlows: () =>
    Effect.flatMap(FlowStore, (store) => store.clearFlows).pipe(
      Effect.map((deleted) => ({ deleted })),
      Effect.mapError(toRpcError),
    ),
});
