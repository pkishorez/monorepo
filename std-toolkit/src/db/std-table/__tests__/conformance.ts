import { Effect, Layer, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Broadcaster, Ulid, type EntityType } from '../../../core/index.js';
import { EntityESchema, ESchema } from '../../../eschema/index.js';
import { encodeCompositeKey } from '../key/index.js';
import { StdTable } from '../table/index.js';
import { StdTableService } from '../contract/index.js';

export const conformanceTable = StdTable.make('portable-conformance')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const itemSchema = EntityESchema.make('Item', 'itemId', {
  category: Schema.String,
  label: Schema.String,
  value: Schema.Number,
}).build();

const item = conformanceTable
  .entity(itemSchema)
  .primary({ pk: ['category'] })
  .index('LSI1', 'byValue', { sk: ['label'] })
  .index('GSI1', 'byLabel', { pk: ['category'], sk: ['label'] })
  .build();

const otherItemSchema = EntityESchema.make('OtherItem', 'itemId', {
  category: Schema.String,
  label: Schema.String,
}).build();

const otherItem = conformanceTable
  .entity(otherItemSchema)
  .primary({ pk: ['category'] })
  .build();

const compoundItemSchema = EntityESchema.make('CompoundItem', 'itemId', {
  category: Schema.String,
  segment: Schema.String,
  label: Schema.NullOr(Schema.String),
}).build();

const compoundItem = conformanceTable
  .entity(compoundItemSchema)
  .primary({ pk: ['category'] })
  .index('GSI1', 'bySegment', {
    pk: ['category'],
    sk: ['segment', 'label'],
  })
  .build();

const configSchema = ESchema.make('Config', {
  theme: Schema.String,
  count: Schema.Number,
}).build();

const config = conformanceTable
  .singleEntity(configSchema)
  .default({ theme: 'light', count: 0 });

const migratedSchema = EntityESchema.make('MigratedItem', 'itemId', {
  category: Schema.String,
  label: Schema.String,
})
  .evolve('v2', { note: Schema.String }, (previous) => ({
    ...previous,
    note: 'migrated',
  }))
  .build();

const migratedItem = conformanceTable
  .entity(migratedSchema)
  .primary({ pk: ['category'] })
  .build();

export interface PortableConformanceAdapter {
  readonly name: string;
  readonly makeLayer: () => Layer.Layer<
    StdTableService<typeof conformanceTable.logicalName>,
    unknown
  >;
}

export const runConformanceSuite = (
  adapter: PortableConformanceAdapter,
): void => {
  let ulidSequence = 0;
  const deterministicUlid = () => String(++ulidSequence).padStart(26, '0');
  const run = <A, E>(
    effect: Effect.Effect<
      A,
      E,
      StdTableService<typeof conformanceTable.logicalName>
    >,
  ) =>
    Effect.runPromise(
      effect.pipe(
        Effect.provide(adapter.makeLayer()),
        Effect.provideService(Ulid, deterministicUlid),
      ),
    );

  describe(`portable conformance: ${adapter.name}`, () => {
    it('inserts, reads, updates, tombstones, restores, and hard deletes', async () => {
      await run(
        Effect.gen(function* () {
          const inserted = yield* item.insert({
            itemId: 'one',
            category: 'a',
            label: 'one',
            value: 1,
          });
          expect(inserted.meta._d).toBe(false);
          expect(
            yield* item.get({ itemId: 'missing', category: 'a' }),
          ).toBeNull();
          const duplicate = yield* item
            .insert({
              itemId: 'one',
              category: 'a',
              label: 'one',
              value: 1,
            })
            .pipe(Effect.result);
          expect(duplicate._tag).toBe('Failure');
          if (duplicate._tag === 'Failure')
            expect(duplicate.failure.reason._tag).toBe('ItemAlreadyExists');
          expect(
            (yield* item.get({ itemId: 'one', category: 'a' }))?.value.value,
          ).toBe(1);

          const updated = yield* item.getAndUpdate(
            { itemId: 'one', category: 'a' },
            ({ value }) => ({ value: value + 1 }),
          );
          expect(updated.value.value).toBe(2);

          const deleted = yield* item.delete({ itemId: 'one', category: 'a' });
          expect(deleted.meta._d).toBe(true);
          expect(
            (yield* item.get({ itemId: 'one', category: 'a' }))?.meta._d,
          ).toBe(true);
          expect(
            yield* item.get(
              { itemId: 'one', category: 'a' },
              { excludeDeleted: true },
            ),
          ).toBeNull();

          expect(
            (yield* item.restore({ itemId: 'one', category: 'a' })).meta._d,
          ).toBe(false);
          yield* item.hardDelete(
            { itemId: 'one', category: 'a' },
            'I KNOW WHAT I AM DOING',
          );
          expect(yield* item.get({ itemId: 'one', category: 'a' })).toBeNull();
        }),
      );
    });

    it('preserves metadata, skips no-op writes, and rejects primary key changes', async () => {
      const broadcasts: EntityType<object>[] = [];
      const broadcaster = Layer.succeed(Broadcaster, {
        broadcast: (entities) => broadcasts.push(...entities),
      });
      await Effect.runPromise(
        Effect.gen(function* () {
          const inserted = yield* item.insert({
            itemId: 'stable',
            category: 'a',
            label: 'stable',
            value: 1,
          });
          expect(inserted.meta).toMatchObject({
            _e: 'Item',
            _v: 'v1',
            _d: false,
          });
          expect(inserted.meta._u).not.toBe('');

          const beforeSkip = broadcasts.length;
          const skipped = yield* item.getAndUpdate(
            { itemId: 'stable', category: 'a' },
            () => null,
          );
          expect(skipped).toEqual(inserted);
          expect(broadcasts).toHaveLength(beforeSkip);

          const missing = yield* item
            .getAndUpdate({ itemId: 'missing', category: 'a' }, { value: 2 })
            .pipe(Effect.result);
          expect(missing).toMatchObject({
            _tag: 'Failure',
            failure: { reason: { _tag: 'NoItemToUpdate' } },
          });

          for (const update of [{ itemId: 'moved' }, { category: 'moved' }]) {
            const changedKey = yield* item
              .getAndUpdate({ itemId: 'stable', category: 'a' }, update)
              .pipe(Effect.result);
            expect(changedKey).toMatchObject({
              _tag: 'Failure',
              failure: {
                reason: { _tag: 'PrimaryKeyUpdateNotSupported' },
              },
            });
          }

          const liveRestore = yield* item.restore({
            itemId: 'stable',
            category: 'a',
          });
          expect(liveRestore).toEqual(inserted);
          expect(broadcasts).toHaveLength(beforeSkip);
        }).pipe(
          Effect.provide(Layer.merge(adapter.makeLayer(), broadcaster)),
          Effect.provideService(Ulid, deterministicUlid),
        ),
      );
    });

    it('rejects a conditioned write when the row vanishes after the read', async () => {
      await run(
        Effect.gen(function* () {
          const key = { itemId: 'ghost', category: 'a' };
          yield* item.insert({ ...key, label: 'ghost', value: 1 });
          const op = yield* item.getAndUpdateOp(key, { value: 2 });
          yield* item.hardDelete(key, 'I KNOW WHAT I AM DOING');

          const result = yield* conformanceTable
            .transact([op])
            .pipe(Effect.result);

          expect(result._tag).toBe('Failure');
          expect(yield* item.get(key)).toBeNull();
        }),
      );
    });

    it('commits transaction ops atomically and broadcasts after success', async () => {
      const broadcasts: EntityType<object>[] = [];
      const broadcaster = Layer.succeed(Broadcaster, {
        broadcast: (entities) => broadcasts.push(...entities),
      });
      await Effect.runPromise(
        Effect.gen(function* () {
          const first = yield* item.insertOp({
            itemId: 'one',
            category: 'a',
            label: 'one',
            value: 1,
          });
          const second = yield* item.insertOp({
            itemId: 'two',
            category: 'a',
            label: 'two',
            value: 2,
          });
          const written = yield* conformanceTable.transact([first, second]);
          expect(written).toHaveLength(2);
        }).pipe(
          Effect.provide(Layer.merge(adapter.makeLayer(), broadcaster)),
          Effect.provideService(Ulid, deterministicUlid),
        ),
      );
      expect(broadcasts).toHaveLength(2);
    });

    it('rejects duplicate, oversized, and condition-failing transactions before partial writes', async () => {
      const broadcasts: EntityType<object>[] = [];
      const broadcaster = Layer.succeed(Broadcaster, {
        broadcast: (entities) => broadcasts.push(...entities),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* item.insert({
            itemId: 'existing',
            category: 'a',
            label: 'existing',
            value: 1,
          });
          broadcasts.length = 0;

          const duplicate = yield* item.insertOp({
            itemId: 'duplicate',
            category: 'a',
            label: 'duplicate',
            value: 1,
          });
          const duplicateResult = yield* conformanceTable
            .transact([duplicate, duplicate])
            .pipe(Effect.result);
          expect(duplicateResult._tag).toBe('Failure');
          if (duplicateResult._tag === 'Failure') {
            expect(duplicateResult.failure.reason._tag).toBe(
              'DuplicateTransactionTarget',
            );
          }

          const oversized = yield* conformanceTable
            .transact(Array.from({ length: 101 }, () => duplicate))
            .pipe(Effect.result);
          expect(oversized._tag).toBe('Failure');
          if (oversized._tag === 'Failure') {
            expect(oversized.failure.reason._tag).toBe('TransactionTooLarge');
          }

          const fresh = yield* item.insertOp({
            itemId: 'fresh',
            category: 'a',
            label: 'fresh',
            value: 1,
          });
          const conflicts = yield* item.insertOp({
            itemId: 'existing',
            category: 'a',
            label: 'existing',
            value: 2,
          });
          const failed = yield* conformanceTable
            .transact([fresh, conflicts])
            .pipe(Effect.result);
          expect(failed._tag).toBe('Failure');
          expect(
            yield* item.get({ itemId: 'fresh', category: 'a' }),
          ).toBeNull();
          expect(broadcasts).toHaveLength(0);
        }).pipe(
          Effect.provide(Layer.merge(adapter.makeLayer(), broadcaster)),
          Effect.provideService(Ulid, deterministicUlid),
        ),
      );
    });

    it('handles empty, stale, last-write-wins, mixed, and foreign transactions', async () => {
      const broadcasts: EntityType<object>[] = [];
      const broadcaster = Layer.succeed(Broadcaster, {
        broadcast: (entities) => broadcasts.push(...entities),
      });
      await Effect.runPromise(
        Effect.gen(function* () {
          expect(yield* conformanceTable.transact([])).toEqual([]);
          expect(broadcasts).toEqual([]);

          yield* item.insert({
            itemId: 'stale',
            category: 'a',
            label: 'stale',
            value: 1,
          });
          const stale = yield* item.getAndUpdateOp(
            { itemId: 'stale', category: 'a' },
            { value: 2 },
          );
          yield* item.getAndUpdate(
            { itemId: 'stale', category: 'a' },
            { value: 3 },
          );
          const fresh = yield* item.insertOp({
            itemId: 'fresh',
            category: 'a',
            label: 'fresh',
            value: 1,
          });
          const staleResult = yield* conformanceTable
            .transact([fresh, stale])
            .pipe(Effect.result);
          expect(staleResult).toMatchObject({
            _tag: 'Failure',
            failure: { reason: { _tag: 'ConditionFailed' } },
          });
          expect(
            yield* item.get({ itemId: 'fresh', category: 'a' }),
          ).toBeNull();

          const lww = yield* item.getAndUpdateOp(
            { itemId: 'stale', category: 'a' },
            { value: 4 },
            { lastWriteWins: true },
          );
          yield* item.getAndUpdate(
            { itemId: 'stale', category: 'a' },
            { value: 5 },
          );
          yield* conformanceTable.transact([lww]);
          expect(
            (yield* item.get({ itemId: 'stale', category: 'a' }))?.value.value,
          ).toBe(4);

          const deleteOp = yield* item.deleteOp({
            itemId: 'stale',
            category: 'a',
          });
          yield* conformanceTable.transact([deleteOp]);
          expect(
            (yield* item.get({ itemId: 'stale', category: 'a' }))?.meta._d,
          ).toBe(true);
          const restoreOp = yield* item.restoreOp({
            itemId: 'stale',
            category: 'a',
          });
          yield* conformanceTable.transact([restoreOp]);
          expect(
            (yield* item.get({ itemId: 'stale', category: 'a' }))?.meta._d,
          ).toBe(false);

          const foreign = {
            tableName: 'portable-conformance-foreign',
            target: 'foreign',
            operationKind: 'insertOp',
            apply: () => {
              throw new Error('Foreign operations must not be applied');
            },
          };
          const foreignResult = yield* conformanceTable
            .transact([foreign as never])
            .pipe(Effect.result);
          expect(foreignResult).toMatchObject({
            _tag: 'Failure',
            failure: { reason: { _tag: 'ForeignTransactionItem' } },
          });
        }).pipe(
          Effect.provide(Layer.merge(adapter.makeLayer(), broadcaster)),
          Effect.provideService(Ulid, deterministicUlid),
        ),
      );
    });

    it('pages through excluded tombstones with after and hasMore', async () => {
      await run(
        Effect.gen(function* () {
          for (const [itemId, label] of [
            ['one', 'a'],
            ['two', 'b'],
            ['three', 'c'],
            ['four', 'd'],
          ] as const) {
            yield* item.insert({ itemId, category: 'a', label, value: 1 });
          }
          yield* item.delete({ itemId: 'two', category: 'a' });

          const first = yield* item.query(
            'byLabel',
            { pk: { category: 'a' }, beginsWith: { label: '' } },
            { limit: 2, excludeDeleted: true },
          );
          expect(first.items.map(({ value }) => value.itemId)).toEqual([
            'one',
            'three',
          ]);
          expect(first.hasMore).toBe(true);

          const second = yield* item.query(
            'byLabel',
            { pk: { category: 'a' }, beginsWith: { label: '' } },
            {
              limit: 2,
              excludeDeleted: true,
              after: first.items.at(-1)!,
            },
          );
          expect(second.items.map(({ value }) => value.itemId)).toEqual([
            'four',
          ]);
          expect(second.hasMore).toBe(false);

          const descending = yield* item.query(
            'byLabel',
            { pk: { category: 'a' }, '<=': null },
            { limit: 2 },
          );
          expect(descending.items.map(({ value }) => value.itemId)).toEqual([
            'four',
            'three',
          ]);
          expect(descending.hasMore).toBe(true);
          const descendingRest = yield* item.query(
            'byLabel',
            { pk: { category: 'a' }, '<=': null },
            { after: descending.items.at(-1)! },
          );
          expect(descendingRest.items.map(({ value }) => value.itemId)).toEqual(
            ['two', 'one'],
          );
          expect(descendingRest.hasMore).toBe(false);

          const primary = yield* item.query(
            'primary',
            { pk: { category: 'a' }, '>=': null },
            { limit: 3 },
          );
          expect(primary.hasMore).toBe(true);
          const primaryRest = yield* item.query(
            'primary',
            { pk: { category: 'a' }, '>=': null },
            { after: primary.items.at(-1)! },
          );
          expect(primaryRest.items.length).toBe(1);
          expect(primaryRest.hasMore).toBe(false);

          for (const itemId of ['tie-1', 'tie-2', 'tie-3']) {
            yield* item.insert({
              itemId,
              category: 'ties',
              label: 'same',
              value: 1,
            });
          }
          const seen: string[] = [];
          let page = yield* item.query(
            'byLabel',
            { pk: { category: 'ties' }, '=': { label: 'same' } },
            { limit: 1 },
          );
          seen.push(...page.items.map(({ value }) => value.itemId));
          while (page.hasMore) {
            page = yield* item.query(
              'byLabel',
              { pk: { category: 'ties' }, '=': { label: 'same' } },
              { limit: 1, after: page.items.at(-1)! },
            );
            seen.push(...page.items.map(({ value }) => value.itemId));
          }
          expect(seen.sort()).toEqual(['tie-1', 'tie-2', 'tie-3']);
        }),
      );
    });

    it('persists and resets a single entity record', async () => {
      await run(
        Effect.gen(function* () {
          const initial = yield* config.get();
          expect(initial.value).toEqual({ theme: 'light', count: 0 });
          expect(initial.meta).toEqual({
            _e: 'Config',
            _v: 'v1',
            _u: '',
          });

          const missingOp = yield* config
            .getAndUpdateOp({ theme: 'dark' })
            .pipe(Effect.result);
          expect(missingOp).toMatchObject({
            _tag: 'Failure',
            failure: { reason: { _tag: 'NoItemToUpdate' } },
          });

          const updated = yield* config.getAndUpdate(({ count }) => ({
            theme: 'dark',
            count: count + 1,
          }));
          expect(updated.value).toEqual({ theme: 'dark', count: 1 });
          const skipped = yield* config.getAndUpdate(() => null);
          expect(skipped).toEqual(updated);

          const op = yield* config.getAndUpdateOp({ count: 2 });
          yield* conformanceTable.transact([op]);
          expect((yield* config.get()).value.count).toBe(2);

          const stale = yield* config.getAndUpdateOp({ count: 3 });
          yield* config.getAndUpdate({ count: 4 });
          const staleResult = yield* conformanceTable
            .transact([stale])
            .pipe(Effect.result);
          expect(staleResult).toMatchObject({
            _tag: 'Failure',
            failure: { reason: { _tag: 'ConditionFailed' } },
          });
          expect((yield* config.get()).value.count).toBe(4);

          const lww = yield* config.getAndUpdateOp(
            { count: 5 },
            { lastWriteWins: true },
          );
          yield* config.getAndUpdate({ count: 6 });
          yield* conformanceTable.transact([lww]);
          expect((yield* config.get()).value.count).toBe(5);

          const reset = yield* config.reset();
          expect(reset.value).toEqual({ theme: 'light', count: 0 });
          expect(reset.meta._u).not.toBe('');
          expect(yield* config.get()).toEqual(reset);
        }),
      );
    });

    it('removes only the selected entity type', async () => {
      await run(
        Effect.gen(function* () {
          yield* item.insert({
            itemId: 'remove',
            category: 'a',
            label: 'remove',
            value: 1,
          });
          yield* otherItem.insert({
            itemId: 'keep',
            category: 'a',
            label: 'keep',
          });
          expect(
            yield* item.dangerouslyRemoveAllItems('I KNOW WHAT I AM DOING'),
          ).toEqual({ itemsDeleted: 1 });
          expect(
            yield* item.get({ itemId: 'remove', category: 'a' }),
          ).toBeNull();
          expect(
            yield* otherItem.get({ itemId: 'keep', category: 'a' }),
          ).not.toBeNull();
          expect(
            yield* conformanceTable.dangerouslyRemoveAllItems(
              'I KNOW WHAT I AM DOING',
            ),
          ).toEqual({ itemsDeleted: 1 });
          expect(
            yield* otherItem.get({ itemId: 'keep', category: 'a' }),
          ).toBeNull();
        }),
      );
    });

    it('supports every portable sort condition and direction', async () => {
      await run(
        Effect.gen(function* () {
          for (const label of ['a', 'b', 'c', 'd']) {
            yield* item.insert({
              itemId: label,
              category: 'a',
              label,
              value: 1,
            });
          }

          const less = yield* item.query('byLabel', {
            pk: { category: 'a' },
            '<': { label: 'd' },
          });
          expect(less.items.map(({ value }) => value.label)).toEqual([
            'c',
            'b',
            'a',
          ]);
          const greater = yield* item.query('byLabel', {
            pk: { category: 'a' },
            '>=': { label: 'c' },
          });
          expect(greater.items.map(({ value }) => value.label)).toEqual([
            'c',
            'd',
          ]);
          const lessOrEqual = yield* item.query('byLabel', {
            pk: { category: 'a' },
            '<=': { label: 'b' },
          });
          expect(lessOrEqual.items.map(({ value }) => value.label)).toEqual([
            'b',
            'a',
          ]);
          const greaterThan = yield* item.query('byLabel', {
            pk: { category: 'a' },
            '>': { label: 'b' },
          });
          expect(greaterThan.items.map(({ value }) => value.label)).toEqual([
            'c',
            'd',
          ]);
          const between = yield* item.query('byLabel', {
            pk: { category: 'a' },
            between: [{ label: 'b' }, { label: 'c' }],
          });
          expect(between.items.map(({ value }) => value.label)).toEqual([
            'b',
            'c',
          ]);
          const exact = yield* item.query('byLabel', {
            pk: { category: 'a' },
            '=': { label: 'b' },
          });
          expect(exact.items.map(({ value }) => value.label)).toEqual(['b']);
          const lsi = yield* item.query('byValue', {
            pk: { category: 'a' },
            beginsWith: { label: 'c' },
          });
          expect(lsi.items.map(({ value }) => value.label)).toEqual(['c']);

          const primary = yield* item.query('primary', {
            pk: { category: 'a' },
            beginsWith: { itemId: 'b' },
          });
          expect(primary.items.map(({ value }) => value.itemId)).toEqual(['b']);

          const unboundedAscending = yield* item.query('primary', {
            pk: { category: 'a' },
            '>=': null,
          });
          expect(
            unboundedAscending.items.map(({ value }) => value.itemId),
          ).toEqual(['a', 'b', 'c', 'd']);
          const unboundedDescending = yield* item.query('primary', {
            pk: { category: 'a' },
            '<=': null,
          });
          expect(
            unboundedDescending.items.map(({ value }) => value.itemId),
          ).toEqual(['d', 'c', 'b', 'a']);

          expect(
            (yield* item.query('primary', {
              pk: { category: 'missing' },
              '>=': null,
            })).items,
          ).toEqual([]);
        }),
      );
    });

    it('supports sparse compound indexes and rejects invalid queries', async () => {
      await run(
        Effect.gen(function* () {
          for (const value of [
            { itemId: 'a', category: 'a', segment: 'one', label: 'alpha' },
            { itemId: 'b', category: 'a', segment: 'one', label: 'alpine' },
            { itemId: 'c', category: 'a', segment: 'two', label: 'alpha' },
            { itemId: 'd', category: 'a', segment: 'one', label: null },
          ] as const) {
            yield* compoundItem.insert(value);
          }

          const compound = yield* compoundItem.query('bySegment', {
            pk: { category: 'a' },
            beginsWith: { segment: 'one', label: 'alp' },
          });
          expect(compound.items.map(({ value }) => value.itemId)).toEqual([
            'a',
            'b',
          ]);
          expect(compound.items.some(({ value }) => value.itemId === 'd')).toBe(
            false,
          );

          for (const effect of [
            compoundItem.query(
              'missing' as never,
              {
                pk: { category: 'a' },
                '>=': null,
              } as never,
            ),
            compoundItem.query(
              'primary',
              {
                pk: { category: 'a' },
                '>=': null,
              },
              { limit: 0 },
            ),
            compoundItem.query('primary', {
              pk: { category: 'a' },
              '>=': null,
              '<=': null,
            } as never),
          ]) {
            const result = yield* effect.pipe(Effect.result);
            expect(result).toMatchObject({
              _tag: 'Failure',
              failure: { reason: { _tag: 'InvalidQuery' } },
            });
          }
        }),
      );
    });

    it('defaults query pages to 100 returned entities', async () => {
      await run(
        Effect.gen(function* () {
          for (let index = 0; index < 101; index++) {
            const id = String(index).padStart(3, '0');
            yield* item.insert({
              itemId: id,
              category: 'default-limit',
              label: id,
              value: index,
            });
          }
          const first = yield* item.query('primary', {
            pk: { category: 'default-limit' },
            '>=': null,
          });
          expect(first.items).toHaveLength(100);
          expect(first.hasMore).toBe(true);
          const second = yield* item.query(
            'primary',
            { pk: { category: 'default-limit' }, '>=': null },
            { after: first.items.at(-1)! },
          );
          expect(second.items).toHaveLength(1);
          expect(second.hasMore).toBe(false);
        }),
      );
    });
  });

  it('decodes and migrates stored older schema versions', async () => {
    await run(
      Effect.gen(function* () {
        const inserted = yield* migratedItem.insert({
          itemId: 'one',
          category: 'a',
          label: 'legacy',
          note: 'current',
        });
        const contract = (yield* StdTableService(conformanceTable.logicalName))
          .contract;
        const key = {
          pk: encodeCompositeKey(['MigratedItem', 'a']),
          sk: encodeCompositeKey(['one']),
        };
        const stored = yield* contract.getItem(key);
        expect(stored).not.toBeNull();
        yield* contract.writeItem({
          item: {
            ...stored!,
            data: {
              _v: 'v1',
              itemId: 'one',
              category: 'a',
              label: 'legacy',
            },
            meta: { ...stored!.meta, _v: 'v1' },
          },
          condition: { kind: 'updated', value: inserted.meta._u },
        });

        const migrated = yield* migratedItem.get({
          itemId: 'one',
          category: 'a',
        });
        expect(migrated?.value.note).toBe('migrated');
        expect(migrated?.meta._v).toBe('v1');
      }),
    );
  });

  it('normalizes schema decoding failures', async () => {
    await run(
      Effect.gen(function* () {
        const inserted = yield* item.insert({
          itemId: 'invalid',
          category: 'a',
          label: 'invalid',
          value: 1,
        });
        const contract = (yield* StdTableService(conformanceTable.logicalName))
          .contract;
        const key = {
          pk: encodeCompositeKey(['Item', 'a']),
          sk: encodeCompositeKey(['invalid']),
        };
        const stored = yield* contract.getItem(key);
        yield* contract.writeItem({
          item: {
            ...stored!,
            data: { ...stored!.data, value: 'not-a-number' },
          },
          condition: { kind: 'updated', value: inserted.meta._u },
        });
        const result = yield* item
          .get({ itemId: 'invalid', category: 'a' })
          .pipe(Effect.result);
        expect(result).toMatchObject({
          _tag: 'Failure',
          failure: { reason: { _tag: 'DecodeFailed' } },
        });
      }),
    );
  });
};
