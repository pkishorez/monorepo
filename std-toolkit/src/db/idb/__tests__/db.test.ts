import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { openDB } from 'idb';
import { IdbDB } from '../db.js';
import { idbLayer } from '../layer.js';
import type { IdbRecord } from '../db.js';

let dbCounter = 0;
const uniqueDbName = () => `idb-db-test-${++dbCounter}`;

const makeRecord = (overrides: Partial<IdbRecord> = {}): IdbRecord => ({
  pk: 'USER#1',
  sk: 'PROFILE',
  _data: { name: 'Ada' },
  _e: 'User',
  _v: '1',
  _u: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  _d: false,
  ...overrides,
});

const runWith = <A, E>(
  layer: Layer.Layer<IdbDB>,
  effect: Effect.Effect<A, E, IdbDB>,
) => Effect.runPromise(effect.pipe(Effect.provide(layer)));

describe('IdbDB', () => {
  describe('put / get', () => {
    it('roundtrips a record with _data as a real object', async () => {
      const dbName = uniqueDbName();
      const layer = idbLayer(dbName, 'std_data');
      const record = makeRecord();

      const result = await runWith(
        layer,
        Effect.gen(function* () {
          const db = yield* IdbDB;
          yield* db.setup({});
          yield* db.put(record);
          return yield* db.get({ pk: record.pk, sk: record.sk });
        }),
      );

      expect(result).toEqual(record);
      expect(result?._data).toBeTypeOf('object');
      expect(result?._data).not.toBeInstanceOf(String);
    });

    it('returns null for a missing key', async () => {
      const dbName = uniqueDbName();
      const layer = idbLayer(dbName, 'std_data');

      const result = await runWith(
        layer,
        Effect.gen(function* () {
          const db = yield* IdbDB;
          yield* db.setup({});
          return yield* db.get({ pk: 'NONE', sk: 'NONE' });
        }),
      );

      expect(result).toBeNull();
    });
  });

  describe('delete / clear', () => {
    it('deletes a record', async () => {
      const dbName = uniqueDbName();
      const layer = idbLayer(dbName, 'std_data');
      const record = makeRecord();

      const result = await runWith(
        layer,
        Effect.gen(function* () {
          const db = yield* IdbDB;
          yield* db.setup({});
          yield* db.put(record);
          yield* db.delete({ pk: record.pk, sk: record.sk });
          return yield* db.get({ pk: record.pk, sk: record.sk });
        }),
      );

      expect(result).toBeNull();
    });

    it('clears all records and reports the count removed', async () => {
      const dbName = uniqueDbName();
      const layer = idbLayer(dbName, 'std_data');

      const result = await runWith(
        layer,
        Effect.gen(function* () {
          const db = yield* IdbDB;
          yield* db.setup({});
          yield* db.put(makeRecord({ sk: 'A' }));
          yield* db.put(makeRecord({ sk: 'B' }));
          const cleared = yield* db.clear();
          const remaining = yield* db.get({ pk: 'USER#1', sk: 'A' });
          return { cleared, remaining };
        }),
      );

      expect(result.cleared).toEqual({ rowsDeleted: 2 });
      expect(result.remaining).toBeNull();
    });
  });

  describe('setup', () => {
    it('converges when different tables upgrade the same database concurrently', async () => {
      const dbName = uniqueDbName();
      const firstLayer = idbLayer(dbName, 'first_table');
      const secondLayer = idbLayer(dbName, 'second_table');

      await Promise.all([
        runWith(
          firstLayer,
          Effect.gen(function* () {
            const db = yield* IdbDB;
            yield* db.setup({ FIRST_IDX: { pk: 'firstPk', sk: 'firstSk' } });
          }),
        ),
        runWith(
          secondLayer,
          Effect.gen(function* () {
            const db = yield* IdbDB;
            yield* db.setup({
              SECOND_IDX: { pk: 'secondPk', sk: 'secondSk' },
            });
          }),
        ),
      ]);

      const raw = await openDB(dbName);
      try {
        expect(raw.objectStoreNames.contains('first_table')).toBe(true);
        expect(raw.objectStoreNames.contains('second_table')).toBe(true);
        expect(
          raw
            .transaction('first_table')
            .objectStore('first_table')
            .indexNames.contains('FIRST_IDX'),
        ).toBe(true);
        expect(
          raw
            .transaction('second_table')
            .objectStore('second_table')
            .indexNames.contains('SECOND_IDX'),
        ).toBe(true);
      } finally {
        raw.close();
      }
    });

    it('is idempotent — calling twice with the same indexes leaves the version unchanged', async () => {
      const dbName = uniqueDbName();
      const layer = idbLayer(dbName, 'std_data');

      await runWith(
        layer,
        Effect.gen(function* () {
          const db = yield* IdbDB;
          yield* db.setup({ IDX1: { pk: 'IDX1PK', sk: 'IDX1SK' } });
        }),
      );

      const rawAfterFirst = await openDB(dbName);
      const versionAfterFirst = rawAfterFirst.version;
      rawAfterFirst.close();

      await runWith(
        layer,
        Effect.gen(function* () {
          const db = yield* IdbDB;
          yield* db.setup({ IDX1: { pk: 'IDX1PK', sk: 'IDX1SK' } });
        }),
      );

      const rawAfterSecond = await openDB(dbName);
      try {
        expect(rawAfterSecond.version).toBe(versionAfterFirst);
      } finally {
        rawAfterSecond.close();
      }
    });

    it('bumps the version by exactly 1 when a new index is added, and creates it', async () => {
      const dbName = uniqueDbName();
      const layer = idbLayer(dbName, 'std_data');

      await runWith(
        layer,
        Effect.gen(function* () {
          const db = yield* IdbDB;
          yield* db.setup({ IDX1: { pk: 'IDX1PK', sk: 'IDX1SK' } });
        }),
      );

      const rawBefore = await openDB(dbName);
      const versionBefore = rawBefore.version;
      rawBefore.close();

      await runWith(
        layer,
        Effect.gen(function* () {
          const db = yield* IdbDB;
          yield* db.setup({
            IDX1: { pk: 'IDX1PK', sk: 'IDX1SK' },
            IDX2: { pk: 'IDX2PK', sk: 'IDX2SK' },
          });
        }),
      );

      const rawAfter = await openDB(dbName);
      try {
        expect(rawAfter.version).toBe(versionBefore + 1);
        const tx = rawAfter.transaction('std_data', 'readonly');
        const indexNames = tx.objectStore('std_data').indexNames;
        expect(indexNames.contains('IDX1')).toBe(true);
        expect(indexNames.contains('IDX2')).toBe(true);
        await tx.done;
      } finally {
        rawAfter.close();
      }
    });
  });

  describe('connection failures', () => {
    it('surfaces unavailable IndexedDB as openFailed', async () => {
      const layer = idbLayer(uniqueDbName(), 'std_data');
      vi.stubGlobal('indexedDB', undefined);

      try {
        const error = await runWith(
          layer,
          Effect.gen(function* () {
            const db = yield* IdbDB;
            return yield* db.setup({}).pipe(Effect.flip);
          }),
        );

        expect(error.code).toBe('openFailed');
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe('transact', () => {
    it('applies neither op and fails with conditionFailed when one op violates expectedU', async () => {
      const dbName = uniqueDbName();
      const layer = idbLayer(dbName, 'std_data');
      const recordA = makeRecord({ sk: 'A' });
      const recordB = makeRecord({ sk: 'B' });

      const result = await runWith(
        layer,
        Effect.gen(function* () {
          const db = yield* IdbDB;
          yield* db.setup({});
          const error = yield* db
            .transact([
              { type: 'put', record: recordA },
              {
                type: 'put',
                record: recordB,
                expectedU: 'not-the-real-u',
              },
            ])
            .pipe(Effect.flip);
          const gotA = yield* db.get({ pk: recordA.pk, sk: recordA.sk });
          const gotB = yield* db.get({ pk: recordB.pk, sk: recordB.sk });
          return { error, gotA, gotB };
        }),
      );

      expect(result.error.code).toBe('conditionFailed');
      expect(result.gotA).toBeNull();
      expect(result.gotB).toBeNull();
    });

    it('fails with conditionFailed when expectedU: null is used on an existing key', async () => {
      const dbName = uniqueDbName();
      const layer = idbLayer(dbName, 'std_data');
      const record = makeRecord();

      const result = await runWith(
        layer,
        Effect.gen(function* () {
          const db = yield* IdbDB;
          yield* db.setup({});
          yield* db.put(record);
          return yield* db
            .transact([{ type: 'put', record, expectedU: null }])
            .pipe(Effect.flip);
        }),
      );

      expect(result.code).toBe('conditionFailed');
    });

    it('patch merges values without clobbering unlisted fields', async () => {
      const dbName = uniqueDbName();
      const layer = idbLayer(dbName, 'std_data');
      const record = makeRecord({ _data: { name: 'Ada', age: 30 } });

      const result = await runWith(
        layer,
        Effect.gen(function* () {
          const db = yield* IdbDB;
          yield* db.setup({});
          yield* db.put(record);
          yield* db.transact([
            {
              type: 'patch',
              key: { pk: record.pk, sk: record.sk },
              values: { _data: { name: 'Ada', age: 31 } },
            },
          ]);
          return yield* db.get({ pk: record.pk, sk: record.sk });
        }),
      );

      expect(result?._data).toEqual({ name: 'Ada', age: 31 });
      expect(result?._e).toBe(record._e);
      expect(result?._v).toBe(record._v);
      expect(result?._u).toBe(record._u);
    });

    it('fails with conditionFailed when patching a missing record', async () => {
      const dbName = uniqueDbName();
      const layer = idbLayer(dbName, 'std_data');

      const result = await runWith(
        layer,
        Effect.gen(function* () {
          const db = yield* IdbDB;
          yield* db.setup({});
          return yield* db
            .transact([
              {
                type: 'patch',
                key: { pk: 'NONE', sk: 'NONE' },
                values: { _data: {} },
              },
            ])
            .pipe(Effect.flip);
        }),
      );

      expect(result.code).toBe('conditionFailed');
    });
  });
});
