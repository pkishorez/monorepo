import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { Effect, Layer } from 'effect';
import { IdbDB } from '../src/db.js';
import type { IdbRecord } from '../src/db.js';
import { idbLayer } from '../src/layer.js';
import { IdbTable } from '../src/idb-table.js';

let dbCounter = 0;
const uniqueDbName = () => `idb-table-test-${++dbCounter}`;

const table = IdbTable.make()
  .primary('pk', 'sk')
  .index('gsi1', 'gsi1pk', 'gsi1sk')
  .build();

const makeRecord = (
  sk: string,
  overrides: Partial<IdbRecord> = {},
): IdbRecord => ({
  pk: 'USER#1',
  sk,
  _data: { sk },
  _e: 'User',
  _v: '1',
  _u: `01ARZ3NDEKTSV4RRFFQ69G5F${sk}`,
  _d: false,
  ...overrides,
});

const runWith = <A, E>(
  layer: Layer.Layer<IdbDB>,
  effect: Effect.Effect<A, E, IdbDB>,
) => Effect.runPromise(effect.pipe(Effect.provide(layer)));

const seeded = (records: IdbRecord[]) =>
  Effect.gen(function* () {
    yield* table.setup();
    for (const record of records) {
      yield* table.putItem(record);
    }
  });

const collectionSks = ['A#1', 'A#2', 'B#1', 'B#2', 'C#1'];
const seedCollection = () => seeded(collectionSks.map((sk) => makeRecord(sk)));

const sksOf = (result: { Items: IdbRecord[] }) =>
  result.Items.map((item) => item.sk);

describe('IDB', () => {
  describe('Table', () => {
    describe('query operators', () => {
      it('with no sk condition returns the whole item collection ascending', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const result = await runWith(
          layer,
          seedCollection().pipe(Effect.andThen(table.query({ pk: 'USER#1' }))),
        );
        expect(sksOf(result)).toEqual(['A#1', 'A#2', 'B#1', 'B#2', 'C#1']);
      });

      it('< returns strictly-lesser keys descending by default', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const result = await runWith(
          layer,
          seedCollection().pipe(
            Effect.andThen(table.query({ pk: 'USER#1', sk: { '<': 'B#1' } })),
          ),
        );
        expect(sksOf(result)).toEqual(['A#2', 'A#1']);
      });

      it('<= includes the bound and returns descending by default', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const result = await runWith(
          layer,
          seedCollection().pipe(
            Effect.andThen(table.query({ pk: 'USER#1', sk: { '<=': 'B#1' } })),
          ),
        );
        expect(sksOf(result)).toEqual(['B#1', 'A#2', 'A#1']);
      });

      it('> returns strictly-greater keys ascending', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const result = await runWith(
          layer,
          seedCollection().pipe(
            Effect.andThen(table.query({ pk: 'USER#1', sk: { '>': 'B#1' } })),
          ),
        );
        expect(sksOf(result)).toEqual(['B#2', 'C#1']);
      });

      it('>= includes the bound and returns ascending', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const result = await runWith(
          layer,
          seedCollection().pipe(
            Effect.andThen(table.query({ pk: 'USER#1', sk: { '>=': 'B#1' } })),
          ),
        );
        expect(sksOf(result)).toEqual(['B#1', 'B#2', 'C#1']);
      });

      it('= returns exactly the matching key', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const result = await runWith(
          layer,
          seedCollection().pipe(
            Effect.andThen(table.query({ pk: 'USER#1', sk: { '=': 'B#1' } })),
          ),
        );
        expect(sksOf(result)).toEqual(['B#1']);
      });

      it('between is inclusive on both ends and ascending', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const result = await runWith(
          layer,
          seedCollection().pipe(
            Effect.andThen(
              table.query({ pk: 'USER#1', sk: { between: ['A#2', 'B#2'] } }),
            ),
          ),
        );
        expect(sksOf(result)).toEqual(['A#2', 'B#1', 'B#2']);
      });

      it('beginsWith returns all keys with the prefix ascending', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const result = await runWith(
          layer,
          seedCollection().pipe(
            Effect.andThen(
              table.query({ pk: 'USER#1', sk: { beginsWith: 'B#' } }),
            ),
          ),
        );
        expect(sksOf(result)).toEqual(['B#1', 'B#2']);
      });

      it('never leaks records from another item collection', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const result = await runWith(
          layer,
          seeded([makeRecord('A#1'), makeRecord('A#1', { pk: 'USER#2' })]).pipe(
            Effect.andThen(table.query({ pk: 'USER#1' })),
          ),
        );
        expect(result.Items).toHaveLength(1);
        expect(result.Items[0]?.pk).toBe('USER#1');
      });
    });

    describe('sort direction overrides', () => {
      it('ScanIndexForward: false reverses an ascending query', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const result = await runWith(
          layer,
          seedCollection().pipe(
            Effect.andThen(
              table.query({ pk: 'USER#1' }, { ScanIndexForward: false }),
            ),
          ),
        );
        expect(sksOf(result)).toEqual(['C#1', 'B#2', 'B#1', 'A#2', 'A#1']);
      });

      it('ScanIndexForward: true forces ascending on a < query', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const result = await runWith(
          layer,
          seedCollection().pipe(
            Effect.andThen(
              table.query(
                { pk: 'USER#1', sk: { '<': 'B#1' } },
                { ScanIndexForward: true },
              ),
            ),
          ),
        );
        expect(sksOf(result)).toEqual(['A#1', 'A#2']);
      });
    });

    describe('limits', () => {
      it('Limit truncates the result', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const result = await runWith(
          layer,
          seedCollection().pipe(
            Effect.andThen(table.query({ pk: 'USER#1' }, { Limit: 2 })),
          ),
        );
        expect(sksOf(result)).toEqual(['A#1', 'A#2']);
      });

      it('defaults to a limit of 100', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const records = Array.from({ length: 105 }, (_, i) =>
          makeRecord(`K#${String(i).padStart(3, '0')}`),
        );
        const result = await runWith(
          layer,
          seeded(records).pipe(Effect.andThen(table.query({ pk: 'USER#1' }))),
        );
        expect(result.Items).toHaveLength(100);
        expect(result.Items[0]?.sk).toBe('K#000');
        expect(result.Items[99]?.sk).toBe('K#099');
      });
    });

    describe('secondary index', () => {
      it('queries via the GSI and skips records lacking the GSI key fields (sparse)', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const result = await runWith(
          layer,
          seeded([
            makeRecord('A#1', { gsi1pk: 'ORG#1', gsi1sk: 'M#2' }),
            makeRecord('A#2', { gsi1pk: 'ORG#1', gsi1sk: 'M#1' }),
            makeRecord('A#3'),
          ]).pipe(Effect.andThen(table.index('gsi1').query({ pk: 'ORG#1' }))),
        );
        expect(sksOf(result)).toEqual(['A#2', 'A#1']);
      });

      it('supports sort key conditions and direction on the GSI', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const result = await runWith(
          layer,
          seeded([
            makeRecord('A#1', { gsi1pk: 'ORG#1', gsi1sk: 'M#1' }),
            makeRecord('A#2', { gsi1pk: 'ORG#1', gsi1sk: 'M#2' }),
            makeRecord('A#3', { gsi1pk: 'ORG#1', gsi1sk: 'N#1' }),
          ]).pipe(
            Effect.andThen(
              table
                .index('gsi1')
                .query({ pk: 'ORG#1', sk: { beginsWith: 'M#' } }),
            ),
          ),
        );
        expect(sksOf(result)).toEqual(['A#1', 'A#2']);
      });
    });

    describe('item operations', () => {
      it('getItem returns the stored record, or null when missing', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const record = makeRecord('A#1');
        const result = await runWith(
          layer,
          seeded([record]).pipe(
            Effect.andThen(
              Effect.all({
                found: table.getItem({ pk: 'USER#1', sk: 'A#1' }),
                missing: table.getItem({ pk: 'USER#1', sk: 'NOPE' }),
              }),
            ),
          ),
        );
        expect(result.found).toEqual({ Item: record });
        expect(result.missing).toEqual({ Item: null });
      });

      it('updateItem merges values into an existing record', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const result = await runWith(
          layer,
          seeded([makeRecord('A#1')]).pipe(
            Effect.andThen(
              table.updateItem(
                { pk: 'USER#1', sk: 'A#1' },
                { _data: { sk: 'A#1', renamed: true } },
              ),
            ),
            Effect.andThen(table.getItem({ pk: 'USER#1', sk: 'A#1' })),
          ),
        );
        expect(result.Item?._data).toEqual({ sk: 'A#1', renamed: true });
        expect(result.Item?._e).toBe('User');
      });

      it('deleteItem soft-deletes: the record stays readable with _d: true', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const result = await runWith(
          layer,
          seeded([makeRecord('A#1')]).pipe(
            Effect.andThen(table.deleteItem({ pk: 'USER#1', sk: 'A#1' })),
            Effect.andThen(table.getItem({ pk: 'USER#1', sk: 'A#1' })),
          ),
        );
        expect(result.Item).not.toBeNull();
        expect(result.Item?._d).toBe(true);
      });

      it('query still returns soft-deleted records (tombstones are not filtered)', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const result = await runWith(
          layer,
          seeded([makeRecord('A#1')]).pipe(
            Effect.andThen(table.deleteItem({ pk: 'USER#1', sk: 'A#1' })),
            Effect.andThen(table.query({ pk: 'USER#1' })),
          ),
        );
        expect(sksOf(result)).toEqual(['A#1']);
        expect(result.Items[0]?._d).toBe(true);
      });

      it('hardDeleteItem removes the record entirely', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const result = await runWith(
          layer,
          seeded([makeRecord('A#1')]).pipe(
            Effect.andThen(table.hardDeleteItem({ pk: 'USER#1', sk: 'A#1' })),
            Effect.andThen(table.getItem({ pk: 'USER#1', sk: 'A#1' })),
          ),
        );
        expect(result).toEqual({ Item: null });
      });

      it('dangerouslyRemoveAllItems empties the table and reports the count', async () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const result = await runWith(
          layer,
          seedCollection().pipe(
            Effect.andThen(
              Effect.all({
                removed: table.dangerouslyRemoveAllItems(
                  'I KNOW WHAT I AM DOING',
                ),
                after: table.query({ pk: 'USER#1' }),
              }),
            ),
          ),
        );
        expect(result.removed).toEqual({ itemsDeleted: collectionSks.length });
        expect(result.after.Items).toEqual([]);
      });
    });
  });
});
