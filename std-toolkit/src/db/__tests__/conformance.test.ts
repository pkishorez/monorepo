import 'fake-indexeddb/auto';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect } from 'vitest';
import {
  moreCoverageDomain,
  moreCoverageTest as it,
} from '../../../laymos/more-coverage.js';
import { Cause, Effect, Exit, Layer, Schema } from 'effect';
import { EntityESchema, SingleEntityESchema } from '../../eschema/index.js';
import { Broadcaster, type EntityType } from '../../core/index.js';

import { nodeSqliteLayer } from '../sqlite/sql/adapters/node.js';
import { SQLiteTable } from '../sqlite/index.js';

import { idbLayer, IdbTable } from '../idb/src/index.js';

// ─── Shared assertion surface ───────────────────────────────────────────────
//
// Both adapters expose `getItem`/`putItem`/`deleteItem`/`query`/`index().query`
// at the table level, and `get`/`insert`/`getAndUpdate`/`delete`/`query` at
// the entity level — but with adapter-specific generic constraints that don't
// unify structurally. Since this file only ever calls the shared surface,
// the fixtures narrow to a minimal duck-typed interface and cast into it;
// the real per-adapter types are still checked wherever `makeTable` /
// `makeItemEntity` are implemented below.

type SortKeyCondition =
  | { '<': string }
  | { '<=': string }
  | { '>': string }
  | { '>=': string }
  | { '=': string }
  | { between: [string, string] }
  | { beginsWith: string };

interface Row {
  pk: string;
  sk: string;
  _data: unknown;
  _e: string;
  _v: string;
  _u: string;
  _d: boolean | number;
  [key: string]: unknown;
}

interface QueryOptions {
  Limit?: number;
  ScanIndexForward?: boolean;
}

type ConformanceOp = unknown;

interface ConformanceTable {
  setup(): Effect.Effect<void, any, any>;
  getItem(key: {
    pk: string;
    sk: string;
  }): Effect.Effect<{ Item: Row | null }, any, any>;
  putItem(row: Row): Effect.Effect<void, any, any>;
  deleteItem(key: { pk: string; sk: string }): Effect.Effect<void, any, any>;
  query(
    cond: { pk: string; sk?: SortKeyCondition },
    options?: QueryOptions,
  ): Effect.Effect<{ Items: Row[] }, any, any>;
  index(name: string): {
    query(
      cond: { pk: string; sk?: SortKeyCondition },
      options?: QueryOptions,
    ): Effect.Effect<{ Items: Row[] }, any, any>;
  };
  transact(
    ops: ConformanceOp[],
  ): Effect.Effect<EntityType<unknown>[], any, any>;
}

interface EntityResult {
  value: Record<string, unknown>;
  meta: { _e: string; _v: string; _u: string; _d: boolean };
}

interface ConformanceEntity {
  insert(value: Record<string, unknown>): Effect.Effect<EntityResult, any, any>;
  get(
    key: Record<string, unknown>,
  ): Effect.Effect<EntityResult | null, any, any>;
  getAndUpdate(
    key: Record<string, unknown>,
    update:
      | Record<string, unknown>
      | ((current: Record<string, unknown>) => Record<string, unknown> | null),
    config?: { retries?: number; lastWriteWins?: boolean },
  ): Effect.Effect<EntityResult, any, any>;
  delete(key: Record<string, unknown>): Effect.Effect<EntityResult, any, any>;
  restore(key: Record<string, unknown>): Effect.Effect<EntityResult, any, any>;
  query(
    index: string,
    params: { pk?: Record<string, unknown>; sk: Record<string, unknown> },
    options?: { limit?: number },
  ): Effect.Effect<{ items: EntityResult[] }, any, any>;
  insertOp(
    value: Record<string, unknown>,
  ): Effect.Effect<ConformanceOp, any, any>;
  getAndUpdateOp(
    key: Record<string, unknown>,
    update:
      | Record<string, unknown>
      | ((current: Record<string, unknown>) => Record<string, unknown>),
    options?: { lastWriteWins?: boolean },
  ): Effect.Effect<ConformanceOp, any, any>;
  deleteOp(
    key: Record<string, unknown>,
    options?: { lastWriteWins?: boolean },
  ): Effect.Effect<ConformanceOp, any, any>;
  restoreOp(
    key: Record<string, unknown>,
    options?: { lastWriteWins?: boolean },
  ): Effect.Effect<ConformanceOp, any, any>;
}

interface SingleResult {
  value: Record<string, unknown>;
  meta: { _e: string; _v: string; _u: string };
}

interface ConformanceSingleEntity {
  get(): Effect.Effect<SingleResult, any, any>;
  put(value: Record<string, unknown>): Effect.Effect<SingleResult, any, any>;
  getAndUpdate(
    update:
      | Record<string, unknown>
      | ((current: Record<string, unknown>) => Record<string, unknown> | null),
    config?: { retries?: number; lastWriteWins?: boolean },
  ): Effect.Effect<SingleResult, any, any>;
  reset(): Effect.Effect<SingleResult, any, any>;
  getAndUpdateOp(
    update:
      | Record<string, unknown>
      | ((current: Record<string, unknown>) => Record<string, unknown>),
    config?: { lastWriteWins?: boolean },
  ): Effect.Effect<ConformanceOp, any, any>;
}

interface ConformanceAdapter {
  name: string;
  makeLayer: () => Layer.Layer<any>;
  makeTable: () => ConformanceTable;
  makeRow: (sk: string, overrides?: Partial<Row>) => Row;
  makeItemEntity: (table: ConformanceTable) => ConformanceEntity;
  makeSingleEntity: (table: ConformanceTable) => ConformanceSingleEntity;
  storedDeletedValue: Row['_d'];
  isDuplicateInsertError: (error: unknown) => boolean;
  isConditionFailedError: (error: unknown) => boolean;
  isNoItemToUpdateError: (error: unknown) => boolean;
}

// ─── Test schema (shared across both adapters) ──────────────────────────────

const ItemSchema = EntityESchema.make('Item', 'itemId', {
  category: Schema.String,
  value: Schema.Number,
}).build();

const ConfSchema = SingleEntityESchema.make('Conf', {
  theme: Schema.String,
  count: Schema.Number,
}).build();

const CONF_DEFAULT = { theme: 'light', count: 0 };

// ─── Adapter fixtures — the extension point future adapters join ───────────

let idbDbCounter = 0;

const adapters: ConformanceAdapter[] = [
  {
    name: 'sqlite',
    makeLayer: () => nodeSqliteLayer(new DatabaseSync(':memory:'), 'std_data'),
    makeTable: () =>
      SQLiteTable.make()
        .primary('pk', 'sk')
        .index('gsi1', 'gsi1pk', 'gsi1sk')
        .build() as unknown as ConformanceTable,
    makeRow: (sk, overrides = {}) => ({
      pk: 'COL#1',
      sk,
      _data: JSON.stringify({ sk }),
      _e: 'Row',
      _v: 'v1',
      _u: `U#${sk}`,
      _d: 0,
      ...overrides,
    }),
    makeItemEntity: (table) =>
      (table as any)
        .entity(ItemSchema)
        .primary({ pk: ['category'] })
        .build() as unknown as ConformanceEntity,
    makeSingleEntity: (table) =>
      (table as any)
        .singleEntity(ConfSchema)
        .default(CONF_DEFAULT) as unknown as ConformanceSingleEntity,
    storedDeletedValue: 1,
    isDuplicateInsertError: (error) =>
      (error as { error?: { _tag?: string } })?.error?._tag ===
      'ItemAlreadyExists',
    isConditionFailedError: (error) =>
      (error as { error?: { _tag?: string } })?.error?._tag ===
      'ConditionFailed',
    isNoItemToUpdateError: (error) =>
      (error as { error?: { _tag?: string } })?.error?._tag ===
      'NoItemToUpdate',
  },
  {
    name: 'idb',
    makeLayer: () => idbLayer(`conformance-${++idbDbCounter}`, 'std_data'),
    makeTable: () =>
      IdbTable.make()
        .primary('pk', 'sk')
        .index('gsi1', 'gsi1pk', 'gsi1sk')
        .build() as unknown as ConformanceTable,
    makeRow: (sk, overrides = {}) => ({
      pk: 'COL#1',
      sk,
      _data: { sk },
      _e: 'Row',
      _v: 'v1',
      _u: `U#${sk}`,
      _d: false,
      ...overrides,
    }),
    makeItemEntity: (table) =>
      (table as any)
        .entity(ItemSchema)
        .primary({ pk: ['category'] })
        .build() as unknown as ConformanceEntity,
    makeSingleEntity: (table) =>
      (table as any)
        .singleEntity(ConfSchema)
        .default(CONF_DEFAULT) as unknown as ConformanceSingleEntity,
    storedDeletedValue: true,
    isDuplicateInsertError: (error) =>
      (error as { code?: string })?.code === 'conditionFailed',
    isConditionFailedError: (error) =>
      (error as { code?: string })?.code === 'conditionFailed',
    isNoItemToUpdateError: (error) =>
      (error as { code?: string })?.code === 'noItemToUpdate',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const run = <A, E>(layer: Layer.Layer<any>, effect: Effect.Effect<A, E, any>) =>
  Effect.runPromise(effect.pipe(Effect.provide(layer)));

const sksOf = (result: { Items: Row[] }) => result.Items.map((item) => item.sk);

moreCoverageDomain('Database conformance', () => {
  describe.each(adapters)('conformance: $name', (adapter) => {
    describe('table: sort key operators', () => {
      const seedBasic = (table: ConformanceTable) =>
        Effect.gen(function* () {
          yield* table.setup();
          for (const sk of ['a', 'b', 'c', 'd', 'e']) {
            yield* table.putItem(adapter.makeRow(sk));
          }
        });

      it('< returns strictly-lesser keys, descending by default', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const result = await run(
          layer,
          seedBasic(table).pipe(
            Effect.andThen(table.query({ pk: 'COL#1', sk: { '<': 'c' } })),
          ),
        );
        expect(sksOf(result)).toEqual(['b', 'a']);
      });

      it('<= includes the bound, descending by default', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const result = await run(
          layer,
          seedBasic(table).pipe(
            Effect.andThen(table.query({ pk: 'COL#1', sk: { '<=': 'c' } })),
          ),
        );
        expect(sksOf(result)).toEqual(['c', 'b', 'a']);
      });

      it('> returns strictly-greater keys, ascending', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const result = await run(
          layer,
          seedBasic(table).pipe(
            Effect.andThen(table.query({ pk: 'COL#1', sk: { '>': 'c' } })),
          ),
        );
        expect(sksOf(result)).toEqual(['d', 'e']);
      });

      it('>= includes the bound, ascending', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const result = await run(
          layer,
          seedBasic(table).pipe(
            Effect.andThen(table.query({ pk: 'COL#1', sk: { '>=': 'c' } })),
          ),
        );
        expect(sksOf(result)).toEqual(['c', 'd', 'e']);
      });

      it('= returns exactly the matching key', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const result = await run(
          layer,
          seedBasic(table).pipe(
            Effect.andThen(table.query({ pk: 'COL#1', sk: { '=': 'c' } })),
          ),
        );
        expect(sksOf(result)).toEqual(['c']);
      });

      it('between is inclusive on both ends, ascending', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const result = await run(
          layer,
          seedBasic(table).pipe(
            Effect.andThen(
              table.query({ pk: 'COL#1', sk: { between: ['b', 'd'] } }),
            ),
          ),
        );
        expect(sksOf(result)).toEqual(['b', 'c', 'd']);
      });

      it('beginsWith returns all keys with the prefix, ascending', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const seed = Effect.gen(function* () {
          yield* table.setup();
          for (const sk of ['A#1', 'B#1', 'B#2', 'C#1']) {
            yield* table.putItem(adapter.makeRow(sk, { pk: 'COL#2' }));
          }
        });
        const result = await run(
          layer,
          seed.pipe(
            Effect.andThen(
              table.query({ pk: 'COL#2', sk: { beginsWith: 'B#' } }),
            ),
          ),
        );
        expect(sksOf(result)).toEqual(['B#1', 'B#2']);
      });

      it('beginsWith includes a key equal to the prefix and excludes a neighboring prefix', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const seed = Effect.gen(function* () {
          yield* table.setup();
          for (const sk of ['A#1', 'B', 'B#1', 'B#2', 'C#1']) {
            yield* table.putItem(adapter.makeRow(sk, { pk: 'COL#3' }));
          }
        });
        const result = await run(
          layer,
          seed.pipe(
            Effect.andThen(
              table.query({ pk: 'COL#3', sk: { beginsWith: 'B' } }),
            ),
          ),
        );
        expect(sksOf(result)).toEqual(['B', 'B#1', 'B#2']);
      });
    });

    describe('table: sort direction overrides', () => {
      const seedBasic = (table: ConformanceTable) =>
        Effect.gen(function* () {
          yield* table.setup();
          for (const sk of ['a', 'b', 'c', 'd', 'e']) {
            yield* table.putItem(adapter.makeRow(sk));
          }
        });

      it('ScanIndexForward: true forces ascending on a < query', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const result = await run(
          layer,
          seedBasic(table).pipe(
            Effect.andThen(
              table.query(
                { pk: 'COL#1', sk: { '<': 'd' } },
                { ScanIndexForward: true },
              ),
            ),
          ),
        );
        expect(sksOf(result)).toEqual(['a', 'b', 'c']);
      });

      it('ScanIndexForward: false forces descending on a >= query', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const result = await run(
          layer,
          seedBasic(table).pipe(
            Effect.andThen(
              table.query(
                { pk: 'COL#1', sk: { '>=': 'b' } },
                { ScanIndexForward: false },
              ),
            ),
          ),
        );
        expect(sksOf(result)).toEqual(['e', 'd', 'c', 'b']);
      });
    });

    describe('table: limits', () => {
      it('Limit truncates the result', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const seed = Effect.gen(function* () {
          yield* table.setup();
          for (const sk of ['a', 'b', 'c', 'd', 'e']) {
            yield* table.putItem(adapter.makeRow(sk));
          }
        });
        const result = await run(
          layer,
          seed.pipe(Effect.andThen(table.query({ pk: 'COL#1' }, { Limit: 2 }))),
        );
        expect(sksOf(result)).toEqual(['a', 'b']);
      });

      it('defaults to a limit of 100', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const seed = Effect.gen(function* () {
          yield* table.setup();
          for (let i = 0; i < 105; i++) {
            const sk = `K#${String(i).padStart(3, '0')}`;
            yield* table.putItem(adapter.makeRow(sk));
          }
        });
        const result = await run(
          layer,
          seed.pipe(Effect.andThen(table.query({ pk: 'COL#1' }))),
        );
        expect(result.Items).toHaveLength(100);
        expect(result.Items[0]?.sk).toBe('K#000');
        expect(result.Items[99]?.sk).toBe('K#099');
      });
    });

    describe('table: secondary index', () => {
      it('returns only records carrying the index key fields (sparse), ordered by the index sk', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const seed = Effect.gen(function* () {
          yield* table.setup();
          yield* table.putItem(
            adapter.makeRow('A#1', { gsi1pk: 'ORG#1', gsi1sk: 'M#2' }),
          );
          yield* table.putItem(
            adapter.makeRow('A#2', { gsi1pk: 'ORG#1', gsi1sk: 'M#1' }),
          );
          // No gsi1 key fields — must be skipped by the sparse index.
          yield* table.putItem(adapter.makeRow('A#3'));
        });
        const result = await run(
          layer,
          seed.pipe(Effect.andThen(table.index('gsi1').query({ pk: 'ORG#1' }))),
        );
        expect(sksOf(result)).toEqual(['A#2', 'A#1']);
      });
    });

    describe('table: soft delete storage', () => {
      it('stores the adapter-native tombstone value', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const result = await run(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            yield* table.putItem(adapter.makeRow('deleted'));
            yield* table.deleteItem({ pk: 'COL#1', sk: 'deleted' });
            return yield* table.getItem({ pk: 'COL#1', sk: 'deleted' });
          }),
        );

        expect(result.Item?._d).toBe(adapter.storedDeletedValue);
      });
    });

    describe('entity: insert / get roundtrip', () => {
      it('decodes to equal values with stamped meta', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const entity = adapter.makeItemEntity(table);
        const result = await run(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            const inserted = yield* entity.insert({
              itemId: 'item-1',
              category: 'cat-1',
              value: 1,
            });
            const fetched = yield* entity.get({
              itemId: 'item-1',
              category: 'cat-1',
            });
            return { inserted, fetched };
          }),
        );

        expect(result.inserted.value).toEqual({
          _v: 'v1',
          itemId: 'item-1',
          category: 'cat-1',
          value: 1,
        });
        expect(result.inserted.meta._e).toBe('Item');
        expect(result.inserted.meta._v).toBe('v1');
        expect(result.inserted.meta._d).toBe(false);
        expect(result.inserted.meta._u).toBeTruthy();

        expect(result.fetched).toEqual({
          value: { itemId: 'item-1', category: 'cat-1', value: 1 },
          meta: result.inserted.meta,
        });
      });
    });

    describe('entity: getAndUpdate', () => {
      it('changes the value and strictly increases _u lexicographically', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const entity = adapter.makeItemEntity(table);
        const result = await run(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            const inserted = yield* entity.insert({
              itemId: 'item-2',
              category: 'cat-1',
              value: 1,
            });
            const updated = yield* entity.getAndUpdate(
              { itemId: 'item-2', category: 'cat-1' },
              { value: 2 },
            );
            return { inserted, updated };
          }),
        );

        expect(result.updated.value.value).toBe(2);
        expect(result.updated.value.category).toBe('cat-1');
        expect(result.updated.meta._u > result.inserted.meta._u).toBe(true);
      });

      it('a callback derives the partial from the current value', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const entity = adapter.makeItemEntity(table);
        const result = await run(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            yield* entity.insert({
              itemId: 'item-cb',
              category: 'cat-1',
              value: 10,
            });
            return yield* entity.getAndUpdate(
              { itemId: 'item-cb', category: 'cat-1' },
              (current) => ({ value: (current.value as number) + 1 }),
            );
          }),
        );

        expect(result.value.value).toBe(11);
      });

      it('a callback returning null skips the write — no _u bump, no broadcast', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const entity = adapter.makeItemEntity(table);
        const broadcasts: EntityType<unknown>[] = [];
        const broadcasterLayer = Layer.succeed(Broadcaster, {
          broadcast: (values: EntityType<unknown>[]) => {
            broadcasts.push(...values);
          },
        });
        const result = await run(
          Layer.merge(layer, broadcasterLayer),
          Effect.gen(function* () {
            yield* table.setup();
            const inserted = yield* entity.insert({
              itemId: 'item-skip',
              category: 'cat-1',
              value: 1,
            });
            const broadcastsBefore = broadcasts.length;
            const skipped = yield* entity.getAndUpdate(
              { itemId: 'item-skip', category: 'cat-1' },
              () => null,
            );
            return { inserted, skipped, broadcastsBefore };
          }),
        );

        expect(result.skipped.meta._u).toBe(result.inserted.meta._u);
        expect(result.skipped.value.value).toBe(1);
        expect(broadcasts).toHaveLength(result.broadcastsBefore);
      });

      it('fails with noItemToUpdate for a missing key', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const entity = adapter.makeItemEntity(table);
        const error = await run(
          layer,
          table
            .setup()
            .pipe(
              Effect.andThen(
                entity
                  .getAndUpdate(
                    { itemId: 'item-missing', category: 'cat-1' },
                    { value: 2 },
                  )
                  .pipe(Effect.flip),
              ),
            ),
        );

        expect(adapter.isNoItemToUpdateError(error)).toBe(true);
      });
    });

    describe('entity: soft delete', () => {
      it('leaves an identically visible tombstone for both get and query', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const entity = adapter.makeItemEntity(table);
        const result = await run(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            yield* entity.insert({
              itemId: 'item-3',
              category: 'cat-1',
              value: 1,
            });
            const deleted = yield* entity.delete({
              itemId: 'item-3',
              category: 'cat-1',
            });
            const afterGet = yield* entity.get({
              itemId: 'item-3',
              category: 'cat-1',
            });
            const afterQuery = yield* entity.query('primary', {
              pk: { category: 'cat-1' },
              sk: { '>=': null },
            });
            return { deleted, afterGet, afterQuery };
          }),
        );

        expect(result.deleted.meta._d).toBe(true);

        expect(result.afterGet).not.toBeNull();
        expect(result.afterGet!.meta._d).toBe(true);
        expect(result.afterGet!.value.value).toBe(1);

        expect(result.afterQuery.items).toHaveLength(1);
        expect(result.afterQuery.items[0]!.meta._d).toBe(true);
        expect(result.afterQuery.items[0]!.value.value).toBe(1);
      });

      it('restore lifts the tombstone with a fresh _u and broadcasts every step', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const entity = adapter.makeItemEntity(table);
        const broadcasts: EntityType<unknown>[] = [];
        const broadcasterLayer = Layer.succeed(Broadcaster, {
          broadcast: (values: EntityType<unknown>[]) => {
            broadcasts.push(...values);
          },
        });
        const result = await run(
          Layer.merge(layer, broadcasterLayer),
          Effect.gen(function* () {
            yield* table.setup();
            yield* entity.insert({
              itemId: 'item-r',
              category: 'cat-1',
              value: 1,
            });
            const deleted = yield* entity.delete({
              itemId: 'item-r',
              category: 'cat-1',
            });
            const restored = yield* entity.restore({
              itemId: 'item-r',
              category: 'cat-1',
            });
            const afterGet = yield* entity.get({
              itemId: 'item-r',
              category: 'cat-1',
            });
            return { deleted, restored, afterGet };
          }),
        );

        expect(result.restored.meta._d).toBe(false);
        expect(result.restored.meta._u > result.deleted.meta._u).toBe(true);
        expect(result.restored.value.value).toBe(1);

        expect(result.afterGet).not.toBeNull();
        expect(result.afterGet!.meta._d).toBe(false);

        expect(broadcasts.map((b) => b.meta._d)).toEqual([false, true, false]);
      });

      it('restore of a live entity is a no-op returning the current state', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const entity = adapter.makeItemEntity(table);
        const result = await run(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            const inserted = yield* entity.insert({
              itemId: 'item-r2',
              category: 'cat-1',
              value: 1,
            });
            const restored = yield* entity.restore({
              itemId: 'item-r2',
              category: 'cat-1',
            });
            return { inserted, restored };
          }),
        );

        expect(result.restored.meta._d).toBe(false);
        expect(result.restored.meta._u).toBe(result.inserted.meta._u);
      });
    });

    describe('transact', () => {
      const makeStubBroadcasterLayer = () => {
        const broadcasts: EntityType<unknown>[] = [];
        const layer = Layer.succeed(Broadcaster, {
          broadcast: (values: EntityType<unknown>[]) => {
            broadcasts.push(...values);
          },
        });
        return { layer, broadcasts };
      };

      it('treats an empty transaction as a no-op without broadcasting', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const { layer: broadcasterLayer, broadcasts } =
          makeStubBroadcasterLayer();

        const result = await run(
          layer,
          table.transact([]).pipe(Effect.provide(broadcasterLayer)),
        );

        expect(result).toEqual([]);
        expect(broadcasts).toEqual([]);
      });

      it('dies with a clear defect when multiple ops target the same key', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const entity = adapter.makeItemEntity(table);

        const exit = await run(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            const first = yield* entity.insertOp({
              itemId: 'tx-duplicate-key',
              category: 'cat-duplicate-key',
              value: 1,
            });
            const second = yield* entity.insertOp({
              itemId: 'tx-duplicate-key',
              category: 'cat-duplicate-key',
              value: 2,
            });
            return yield* table.transact([first, second]).pipe(Effect.exit);
          }),
        );

        expect(Exit.isFailure(exit)).toBe(true);
        const defects = Exit.isFailure(exit)
          ? exit.cause.reasons.filter(Cause.isDieReason).map((r) => r.defect)
          : [];
        expect(String(defects[0])).toContain(
          'transact requires unique items; 2 ops target',
        );
      });

      it('rolls back every op when one fails its optimistic check', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const entity = adapter.makeItemEntity(table);
        const result = await run(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            yield* entity.insert({
              itemId: 'tx-stale',
              category: 'cat-tx',
              value: 1,
            });

            // The op captures expectedU now; a concurrent writer then bumps _u.
            const staleOp = yield* entity.getAndUpdateOp(
              { itemId: 'tx-stale', category: 'cat-tx' },
              { value: 99 },
            );
            yield* entity.getAndUpdate(
              { itemId: 'tx-stale', category: 'cat-tx' },
              { value: 50 },
            );

            const freshOp = yield* entity.insertOp({
              itemId: 'tx-fresh',
              category: 'cat-tx',
              value: 2,
            });

            const error = yield* table
              .transact([freshOp, staleOp])
              .pipe(Effect.flip);

            const missingFresh = yield* entity.get({
              itemId: 'tx-fresh',
              category: 'cat-tx',
            });
            const untouched = yield* entity.get({
              itemId: 'tx-stale',
              category: 'cat-tx',
            });
            return { error, missingFresh, untouched };
          }),
        );

        expect(adapter.isConditionFailedError(result.error)).toBe(true);
        expect(result.missingFresh).toBeNull();
        expect(result.untouched!.value.value).toBe(50);
      });

      it('broadcasts only after commit, in op order; nothing on failure', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const entity = adapter.makeItemEntity(table);
        const { layer: broadcasterLayer, broadcasts } =
          makeStubBroadcasterLayer();

        const result = await run(
          layer,
          Effect.gen(function* () {
            yield* table.setup();

            const aOp = yield* entity.insertOp({
              itemId: 'tx-a',
              category: 'cat-bc',
              value: 1,
            });
            const bOp = yield* entity.insertOp({
              itemId: 'tx-b',
              category: 'cat-bc',
              value: 2,
            });

            const written = yield* table
              .transact([aOp, bOp])
              .pipe(Effect.provide(broadcasterLayer));
            const successCount = broadcasts.length;

            // A duplicate insert op fails the whole batch → no broadcasts.
            const dupOp = yield* entity.insertOp({
              itemId: 'tx-a',
              category: 'cat-bc',
              value: 3,
            });
            const cOp = yield* entity.insertOp({
              itemId: 'tx-c',
              category: 'cat-bc',
              value: 4,
            });
            const error = yield* table
              .transact([dupOp, cOp])
              .pipe(Effect.provide(broadcasterLayer), Effect.flip);

            const missingC = yield* entity.get({
              itemId: 'tx-c',
              category: 'cat-bc',
            });
            return { written, successCount, error, missingC };
          }),
        );

        expect(result.successCount).toBe(2);
        expect(broadcasts[0]).toBe(result.written[0]);
        expect(broadcasts[1]).toBe(result.written[1]);

        expect(adapter.isConditionFailedError(result.error)).toBe(true);
        expect(broadcasts).toHaveLength(2);
        expect(result.missingC).toBeNull();
      });

      it('applies deleteOp and restoreOp atomically with tombstone broadcasts', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const entity = adapter.makeItemEntity(table);
        const { layer: broadcasterLayer, broadcasts } =
          makeStubBroadcasterLayer();

        const result = await run(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            yield* entity.insert({
              itemId: 'tx-del',
              category: 'cat-dr',
              value: 1,
            });

            const delOp = yield* entity.deleteOp({
              itemId: 'tx-del',
              category: 'cat-dr',
            });
            yield* table
              .transact([delOp])
              .pipe(Effect.provide(broadcasterLayer));
            const afterDelete = yield* entity.get({
              itemId: 'tx-del',
              category: 'cat-dr',
            });

            const resOp = yield* entity.restoreOp({
              itemId: 'tx-del',
              category: 'cat-dr',
            });
            yield* table
              .transact([resOp])
              .pipe(Effect.provide(broadcasterLayer));
            const afterRestore = yield* entity.get({
              itemId: 'tx-del',
              category: 'cat-dr',
            });

            return { afterDelete, afterRestore };
          }),
        );

        expect(result.afterDelete!.meta._d).toBe(true);
        expect(result.afterDelete!.value.value).toBe(1);
        expect(result.afterRestore!.meta._d).toBe(false);
        expect(result.afterRestore!.meta._u > result.afterDelete!.meta._u).toBe(
          true,
        );
        expect(broadcasts.map((b) => b.meta._d)).toEqual([true, false]);
      });

      it('updates a tombstone while preserving deleted state in storage and broadcast', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const entity = adapter.makeItemEntity(table);
        const { layer: broadcasterLayer, broadcasts } =
          makeStubBroadcasterLayer();

        const result = await run(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            yield* entity.insert({
              itemId: 'tx-update-tombstone',
              category: 'cat-tombstone',
              value: 1,
            });
            yield* entity.delete({
              itemId: 'tx-update-tombstone',
              category: 'cat-tombstone',
            });
            const op = yield* entity.getAndUpdateOp(
              {
                itemId: 'tx-update-tombstone',
                category: 'cat-tombstone',
              },
              { value: 2 },
            );
            yield* table.transact([op]).pipe(Effect.provide(broadcasterLayer));
            return yield* entity.get({
              itemId: 'tx-update-tombstone',
              category: 'cat-tombstone',
            });
          }),
        );

        expect(result!.value.value).toBe(2);
        expect(result!.meta._d).toBe(true);
        expect(broadcasts).toHaveLength(1);
        expect(broadcasts[0]!.value).toMatchObject({ value: 2 });
        expect(broadcasts[0]!.meta._d).toBe(true);
      });

      it('rolls back a stale deleteOp without tombstoning', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const entity = adapter.makeItemEntity(table);

        const result = await run(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            yield* entity.insert({
              itemId: 'tx-del-stale',
              category: 'cat-dr',
              value: 1,
            });

            const staleDelOp = yield* entity.deleteOp({
              itemId: 'tx-del-stale',
              category: 'cat-dr',
            });
            yield* entity.getAndUpdate(
              { itemId: 'tx-del-stale', category: 'cat-dr' },
              { value: 50 },
            );

            const error = yield* table.transact([staleDelOp]).pipe(Effect.flip);
            const after = yield* entity.get({
              itemId: 'tx-del-stale',
              category: 'cat-dr',
            });
            return { error, after };
          }),
        );

        expect(adapter.isConditionFailedError(result.error)).toBe(true);
        expect(result.after!.meta._d).toBe(false);
        expect(result.after!.value.value).toBe(50);
      });

      it('updateOp with lastWriteWins applies despite a concurrent write', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const entity = adapter.makeItemEntity(table);

        const result = await run(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            yield* entity.insert({
              itemId: 'tx-lww',
              category: 'cat-lww',
              value: 1,
            });

            const lwwOp = yield* entity.getAndUpdateOp(
              { itemId: 'tx-lww', category: 'cat-lww' },
              { value: 99 },
              { lastWriteWins: true },
            );
            yield* entity.getAndUpdate(
              { itemId: 'tx-lww', category: 'cat-lww' },
              { value: 50 },
            );

            yield* table.transact([lwwOp]);
            return yield* entity.get({
              itemId: 'tx-lww',
              category: 'cat-lww',
            });
          }),
        );

        expect(result!.value.value).toBe(99);
      });

      it('deleteOp with lastWriteWins applies despite a concurrent write', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const entity = adapter.makeItemEntity(table);

        const result = await run(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            yield* entity.insert({
              itemId: 'tx-delete-lww',
              category: 'cat-delete-lww',
              value: 1,
            });
            const op = yield* entity.deleteOp(
              { itemId: 'tx-delete-lww', category: 'cat-delete-lww' },
              { lastWriteWins: true },
            );
            yield* entity.getAndUpdate(
              { itemId: 'tx-delete-lww', category: 'cat-delete-lww' },
              { value: 2 },
            );
            yield* table.transact([op]);
            return yield* entity.get({
              itemId: 'tx-delete-lww',
              category: 'cat-delete-lww',
            });
          }),
        );

        expect(result!.meta._d).toBe(true);
      });

      it('dies on an op built against a different table', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const otherTable = adapter.makeTable();
        const otherEntity = adapter.makeItemEntity(otherTable);

        const exit = await run(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            const foreignOp = yield* otherEntity.insertOp({
              itemId: 'tx-foreign',
              category: 'cat-f',
              value: 1,
            });
            return yield* table.transact([foreignOp]).pipe(Effect.exit);
          }),
        );

        expect(Exit.isFailure(exit)).toBe(true);
        const defects = Exit.isFailure(exit)
          ? exit.cause.reasons.filter(Cause.isDieReason).map((r) => r.defect)
          : [];
        expect(String(defects[0])).toContain(
          'was built against a different table',
        );
      });
    });

    describe('single entity', () => {
      it('get returns the default with sentinel _u before any write', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const single = adapter.makeSingleEntity(table);
        const result = await run(
          layer,
          table.setup().pipe(Effect.andThen(single.get())),
        );

        expect(result.value).toEqual(CONF_DEFAULT);
        expect(result.meta._u).toBe('');
      });

      it('reset persists the default so get and broadcast agree', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const single = adapter.makeSingleEntity(table);
        const broadcasts: EntityType<unknown>[] = [];
        const broadcasterLayer = Layer.succeed(Broadcaster, {
          broadcast: (values: EntityType<unknown>[]) => {
            broadcasts.push(...values);
          },
        });

        const result = await run(
          Layer.merge(layer, broadcasterLayer),
          Effect.gen(function* () {
            yield* table.setup();
            yield* single.put({ theme: 'dark', count: 9 });
            const reverted = yield* single.reset();
            const after = yield* single.get();
            return { reverted, after };
          }),
        );

        expect(result.after.value).toEqual(CONF_DEFAULT);
        expect(result.after.meta._u).toBe(result.reverted.meta._u);
        expect(broadcasts.at(-1)?.meta._u).toBe(result.after.meta._u);
      });

      it('getAndUpdate before the first write treats the default as current and persists', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const single = adapter.makeSingleEntity(table);
        const result = await run(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            const updated = yield* single.getAndUpdate((current) => ({
              count: (current.count as number) + 1,
            }));
            const after = yield* single.get();
            return { updated, after };
          }),
        );

        expect(result.updated.value).toEqual({ theme: 'light', count: 1 });
        expect(result.updated.meta._u).not.toBe('');
        expect(result.after.value).toEqual({ theme: 'light', count: 1 });
        expect(result.after.meta._u).toBe(result.updated.meta._u);
      });

      it('getAndUpdate callback returning null skips the write', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const single = adapter.makeSingleEntity(table);
        const result = await run(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            const skipped = yield* single.getAndUpdate(() => null);
            const after = yield* single.get();
            return { skipped, after };
          }),
        );

        expect(result.skipped.value).toEqual(CONF_DEFAULT);
        expect(result.skipped.meta._u).toBe('');
        expect(result.after.meta._u).toBe('');
      });

      it('getAndUpdateOp fails before the first write', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const single = adapter.makeSingleEntity(table);
        const error = await run(
          layer,
          table
            .setup()
            .pipe(
              Effect.andThen(
                single.getAndUpdateOp({ count: 1 }).pipe(Effect.flip),
              ),
            ),
        );

        expect(adapter.isNoItemToUpdateError(error)).toBe(true);
      });

      it('getAndUpdateOp applies through transact and rolls back when stale', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const single = adapter.makeSingleEntity(table);

        const result = await run(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            yield* single.put({ theme: 'dark', count: 1 });

            const op = yield* single.getAndUpdateOp({ count: 5 });
            yield* table.transact([op]);
            const applied = yield* single.get();

            const staleOp = yield* single.getAndUpdateOp({ count: 9 });
            yield* single.getAndUpdate({ count: 7 });
            const error = yield* table.transact([staleOp]).pipe(Effect.flip);
            const after = yield* single.get();

            return { applied, error, after };
          }),
        );

        expect(result.applied.value.count).toBe(5);
        expect(result.applied.value.theme).toBe('dark');
        expect(adapter.isConditionFailedError(result.error)).toBe(true);
        expect(result.after.value.count).toBe(7);
      });

      it('getAndUpdateOp with lastWriteWins clobbers a concurrent write', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const single = adapter.makeSingleEntity(table);

        const result = await run(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            yield* single.put({ theme: 'dark', count: 1 });

            const lwwOp = yield* single.getAndUpdateOp(
              { count: 99 },
              { lastWriteWins: true },
            );
            yield* single.getAndUpdate({ count: 50 });
            yield* table.transact([lwwOp]);
            return yield* single.get();
          }),
        );

        expect(result.value.count).toBe(99);
      });
    });

    describe('entity: duplicate insert', () => {
      it('fails on a duplicate primary key', async () => {
        const layer = adapter.makeLayer();
        const table = adapter.makeTable();
        const entity = adapter.makeItemEntity(table);
        const error = await run(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            yield* entity.insert({
              itemId: 'item-dup',
              category: 'cat-1',
              value: 1,
            });
            return yield* entity
              .insert({ itemId: 'item-dup', category: 'cat-1', value: 2 })
              .pipe(Effect.flip);
          }),
        );

        expect(adapter.isDuplicateInsertError(error)).toBe(true);
      });
    });
  });
});
