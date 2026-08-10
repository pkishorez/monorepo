import 'fake-indexeddb/auto';
import { it, describe, expect } from 'vitest';
import { vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { openDB } from 'idb';
import { IdbDB, type IdbRecord } from '../services/idb-database/index.js';
import { idbLayer } from '../clients/idb-client/index.js';
import { IdbTable } from '../index.js';

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

describe('IDB', () => {
  describe('Database', () => {
    it('exposes destructive cleanup on the public table API', () => {
      const table = IdbTable.make('std_data').primary('pk', 'sk').build();
      expect(table.dangerouslyRemoveAllItems).toBeTypeOf('function');
    });

    describe('put / get', () => {
      it('roundtrips a record with _data as a real object', async () => {
        const dbName = uniqueDbName();
        const layer = idbLayer(dbName);
        const record = makeRecord();

        const result = await runWith(
          layer,
          Effect.gen(function* () {
            const db = yield* IdbDB;
            yield* db.setup('std_data', {});
            yield* db.put('std_data', record);
            return yield* db.get('std_data', { pk: record.pk, sk: record.sk });
          }),
        );

        expect(result).toEqual(record);
        expect(result?._data).toBeTypeOf('object');
        expect(result?._data).not.toBeInstanceOf(String);
      });

      it('returns null for a missing key', async () => {
        const dbName = uniqueDbName();
        const layer = idbLayer(dbName);

        const result = await runWith(
          layer,
          Effect.gen(function* () {
            const db = yield* IdbDB;
            yield* db.setup('std_data', {});
            return yield* db.get('std_data', { pk: 'NONE', sk: 'NONE' });
          }),
        );

        expect(result).toBeNull();
      });
    });

    describe('delete / clear', () => {
      it('deletes a record', async () => {
        const dbName = uniqueDbName();
        const layer = idbLayer(dbName);
        const record = makeRecord();

        const result = await runWith(
          layer,
          Effect.gen(function* () {
            const db = yield* IdbDB;
            yield* db.setup('std_data', {});
            yield* db.put('std_data', record);
            yield* db.delete('std_data', { pk: record.pk, sk: record.sk });
            return yield* db.get('std_data', { pk: record.pk, sk: record.sk });
          }),
        );

        expect(result).toBeNull();
      });

      it('clears all records and reports the count removed', async () => {
        const dbName = uniqueDbName();
        const layer = idbLayer(dbName);

        const result = await runWith(
          layer,
          Effect.gen(function* () {
            const db = yield* IdbDB;
            yield* db.setup('std_data', {});
            yield* db.put('std_data', makeRecord({ sk: 'A' }));
            yield* db.put('std_data', makeRecord({ sk: 'B' }));
            const cleared = yield* db.clear('std_data');
            const remaining = yield* db.get('std_data', {
              pk: 'USER#1',
              sk: 'A',
            });
            return { cleared, remaining };
          }),
        );

        expect(result.cleared).toEqual({ rowsDeleted: 2 });
        expect(result.remaining).toBeNull();
      });
    });

    describe('setup', () => {
      it('sets up multiple table definitions through one database layer', async () => {
        const dbName = uniqueDbName();
        const layer = idbLayer(dbName);
        const first = IdbTable.make('first_table').primary('pk', 'sk').build();
        const second = IdbTable.make('second_table')
          .primary('pk', 'sk')
          .build();

        await runWith(
          layer,
          Effect.all([first.setup(), second.setup()], {
            concurrency: 'unbounded',
          }),
        );

        const raw = await openDB(dbName);
        try {
          expect(raw.objectStoreNames.contains('first_table')).toBe(true);
          expect(raw.objectStoreNames.contains('second_table')).toBe(true);
        } finally {
          raw.close();
        }
      });

      it('converges when different tables upgrade the same database concurrently', async () => {
        const dbName = uniqueDbName();
        const firstLayer = idbLayer(dbName);
        const secondLayer = idbLayer(dbName);

        await Promise.all([
          runWith(
            firstLayer,
            Effect.gen(function* () {
              const db = yield* IdbDB;
              yield* db.setup('first_table', {
                FIRST_IDX: { pk: 'firstPk', sk: 'firstSk' },
              });
            }),
          ),
          runWith(
            secondLayer,
            Effect.gen(function* () {
              const db = yield* IdbDB;
              yield* db.setup('second_table', {
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
        const layer = idbLayer(dbName);

        await runWith(
          layer,
          Effect.gen(function* () {
            const db = yield* IdbDB;
            yield* db.setup('std_data', {
              IDX1: { pk: 'IDX1PK', sk: 'IDX1SK' },
            });
          }),
        );

        const rawAfterFirst = await openDB(dbName);
        const versionAfterFirst = rawAfterFirst.version;
        rawAfterFirst.close();

        await runWith(
          layer,
          Effect.gen(function* () {
            const db = yield* IdbDB;
            yield* db.setup('std_data', {
              IDX1: { pk: 'IDX1PK', sk: 'IDX1SK' },
            });
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
        const layer = idbLayer(dbName);

        await runWith(
          layer,
          Effect.gen(function* () {
            const db = yield* IdbDB;
            yield* db.setup('std_data', {
              IDX1: { pk: 'IDX1PK', sk: 'IDX1SK' },
            });
          }),
        );

        const rawBefore = await openDB(dbName);
        const versionBefore = rawBefore.version;
        rawBefore.close();

        await runWith(
          layer,
          Effect.gen(function* () {
            const db = yield* IdbDB;
            yield* db.setup('std_data', {
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
        const layer = idbLayer(uniqueDbName());
        vi.stubGlobal('indexedDB', undefined);

        try {
          const error = await runWith(
            layer,
            Effect.gen(function* () {
              const db = yield* IdbDB;
              return yield* db.setup('std_data', {}).pipe(Effect.flip);
            }),
          );

          expect('code' in error && error.code).toBe('openFailed');
        } finally {
          vi.unstubAllGlobals();
        }
      });
    });

    describe('transact', () => {
      it('applies neither op and fails with conditionFailed when one op violates expectedU', async () => {
        const dbName = uniqueDbName();
        const layer = idbLayer(dbName);
        const recordA = makeRecord({ sk: 'A' });
        const recordB = makeRecord({ sk: 'B' });

        const result = await runWith(
          layer,
          Effect.gen(function* () {
            const db = yield* IdbDB;
            yield* db.setup('std_data', {});
            const error = yield* db
              .transact('std_data', [
                { type: 'put', record: recordA },
                {
                  type: 'put',
                  record: recordB,
                  expectedU: 'not-the-real-u',
                },
              ])
              .pipe(Effect.flip);
            const gotA = yield* db.get('std_data', {
              pk: recordA.pk,
              sk: recordA.sk,
            });
            const gotB = yield* db.get('std_data', {
              pk: recordB.pk,
              sk: recordB.sk,
            });
            return { error, gotA, gotB };
          }),
        );

        expect(result.error._tag).toBe('ConditionFailed');
        expect(result.gotA).toBeNull();
        expect(result.gotB).toBeNull();
      });

      it('fails with conditionFailed when expectedU: null is used on an existing key', async () => {
        const dbName = uniqueDbName();
        const layer = idbLayer(dbName);
        const record = makeRecord();

        const result = await runWith(
          layer,
          Effect.gen(function* () {
            const db = yield* IdbDB;
            yield* db.setup('std_data', {});
            yield* db.put('std_data', record);
            return yield* db
              .transact('std_data', [{ type: 'put', record, expectedU: null }])
              .pipe(Effect.flip);
          }),
        );

        expect(result._tag).toBe('ConditionFailed');
      });

      it('patch merges values without clobbering unlisted fields', async () => {
        const dbName = uniqueDbName();
        const layer = idbLayer(dbName);
        const record = makeRecord({ _data: { name: 'Ada', age: 30 } });

        const result = await runWith(
          layer,
          Effect.gen(function* () {
            const db = yield* IdbDB;
            yield* db.setup('std_data', {});
            yield* db.put('std_data', record);
            yield* db.transact('std_data', [
              {
                type: 'patch',
                key: { pk: record.pk, sk: record.sk },
                values: { _data: { name: 'Ada', age: 31 } },
              },
            ]);
            return yield* db.get('std_data', { pk: record.pk, sk: record.sk });
          }),
        );

        expect(result?._data).toEqual({ name: 'Ada', age: 31 });
        expect(result?._e).toBe(record._e);
        expect(result?._v).toBe(record._v);
        expect(result?._u).toBe(record._u);
      });

      it('fails with conditionFailed when patching a missing record', async () => {
        const dbName = uniqueDbName();
        const layer = idbLayer(dbName);

        const result = await runWith(
          layer,
          Effect.gen(function* () {
            const db = yield* IdbDB;
            yield* db.setup('std_data', {});
            return yield* db
              .transact('std_data', [
                {
                  type: 'patch',
                  key: { pk: 'NONE', sk: 'NONE' },
                  values: { _data: {} },
                },
              ])
              .pipe(Effect.flip);
          }),
        );

        expect(result._tag).toBe('ConditionFailed');
      });
    });
  });
});
