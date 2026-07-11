import 'fake-indexeddb/auto';
import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';
import { Effect, Layer, Schema } from 'effect';
import { EntityESchema } from '../../eschema/index.js';

import { betterSqlite3Layer } from '../sqlite/sql/adapters/better-sqlite3.js';
import { SQLiteTable, SQLiteEntity } from '../sqlite/index.js';

import { idbLayer, IdbTable, IdbEntity } from '../idb/index.js';

// ─── Shared assertion surface ───────────────────────────────────────────────
//
// Both adapters expose `getItem`/`putItem`/`deleteItem`/`query`/`index().query`
// at the table level, and `get`/`insert`/`update`/`delete`/`query` at the
// entity level — but with adapter-specific generic constraints that don't
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
  update(
    key: Record<string, unknown>,
    updates: Record<string, unknown>,
  ): Effect.Effect<EntityResult, any, any>;
  delete(key: Record<string, unknown>): Effect.Effect<EntityResult, any, any>;
  query(
    index: string,
    params: { pk?: Record<string, unknown>; sk: Record<string, unknown> },
    options?: { limit?: number },
  ): Effect.Effect<{ items: EntityResult[] }, any, any>;
}

interface ConformanceAdapter {
  name: string;
  makeLayer: () => Layer.Layer<any>;
  makeTable: () => ConformanceTable;
  makeRow: (sk: string, overrides?: Partial<Row>) => Row;
  makeItemEntity: (table: ConformanceTable) => ConformanceEntity;
  storedDeletedValue: Row['_d'];
  isDuplicateInsertError: (error: unknown) => boolean;
}

// ─── Test schema (shared across both adapters) ──────────────────────────────

const ItemSchema = EntityESchema.make('Item', 'itemId', {
  category: Schema.String,
  value: Schema.Number,
}).build();

// ─── Adapter fixtures — the extension point future adapters join ───────────

let idbDbCounter = 0;

const adapters: ConformanceAdapter[] = [
  {
    name: 'sqlite',
    makeLayer: () => betterSqlite3Layer(new Database(':memory:'), 'std_data'),
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
      SQLiteEntity.make(table as any)
        .eschema(ItemSchema)
        .primary({ pk: ['category'] })
        .build() as unknown as ConformanceEntity,
    storedDeletedValue: 1,
    isDuplicateInsertError: (error) =>
      (error as { error?: { _tag?: string } })?.error?._tag ===
      'ItemAlreadyExists',
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
      IdbEntity.make(table as any)
        .eschema(ItemSchema)
        .primary({ pk: ['category'] })
        .build() as unknown as ConformanceEntity,
    storedDeletedValue: true,
    isDuplicateInsertError: (error) =>
      (error as { code?: string })?.code === 'conditionFailed',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const run = <A, E>(layer: Layer.Layer<any>, effect: Effect.Effect<A, E, any>) =>
  Effect.runPromise(effect.pipe(Effect.provide(layer)));

const sksOf = (result: { Items: Row[] }) => result.Items.map((item) => item.sk);

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
          Effect.andThen(table.query({ pk: 'COL#3', sk: { beginsWith: 'B' } })),
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

  describe('entity: update', () => {
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
          const updated = yield* entity.update(
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
