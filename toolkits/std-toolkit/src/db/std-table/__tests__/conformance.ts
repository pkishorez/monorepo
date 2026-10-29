import {
  DateTime,
  Duration,
  Effect,
  Equal,
  Fiber,
  Layer,
  Option,
  Schema,
  Stream,
} from 'effect';
import { describe, expect, it } from 'vitest';
import {
  Broadcaster,
  defaultBroadcaster,
  Ulid,
  type Entity,
} from '../../../core/index.js';
import { EntityESchema, ESchema } from '../../../eschema/index.js';
import { encodeCompositeKey } from '../key/index.js';
import { StdTable } from '../table/index.js';
import { StdTableService } from '../contract/index.js';

const itemSchema = EntityESchema.make('Item', 'itemId', {
  category: Schema.String,
  label: Schema.String,
  value: Schema.Finite,
}).build();

const otherItemSchema = EntityESchema.make('OtherItem', 'itemId', {
  category: Schema.String,
  label: Schema.String,
}).build();

const compoundItemSchema = EntityESchema.make('CompoundItem', 'itemId', {
  category: Schema.String,
  segment: Schema.String,
  label: Schema.NullOr(Schema.String),
}).build();

const configSchema = ESchema.make('Config', {
  theme: Schema.String,
  count: Schema.Finite,
}).build();

const migratedSchema = EntityESchema.make('MigratedItem', 'itemId', {
  category: Schema.String,
  label: Schema.String,
})
  .evolve('v2', { note: Schema.String }, (previous) => ({
    ...previous,
    note: 'migrated',
  }))
  .build();

const docSchema = EntityESchema.make('Doc', 'docId', {
  board: Schema.Struct({ id: Schema.String }),
  rank: Schema.Finite,
  dueAt: Schema.DateFromString,
  owner: Schema.Union([
    Schema.Struct({ kind: Schema.Literal('user'), userId: Schema.String }),
    Schema.Struct({
      kind: Schema.Literal('team'),
      teamId: Schema.String,
      seat: Schema.Finite,
    }),
  ]),
}).build();

// Every kind of conversion at once, nested through structs, unions, arrays,
// records, and another ESchema. v1 had no `rank`; its migration reads a Date.
const windowSchema = ESchema.make('Window', {
  from: Schema.DateFromString,
  to: Schema.NullOr(Schema.DateFromString),
}).build();

const richSchema = EntityESchema.make('Rich', 'richId', {
  category: Schema.String,
  createdAt: Schema.DateFromString,
  size: Schema.BigIntFromString,
  closedAt: Schema.OptionFromNullOr(Schema.DateTimeUtcFromString),
  timeout: Schema.DurationFromMillis,
  window: windowSchema.schema,
  history: Schema.Array(
    Schema.Struct({ at: Schema.DateFromString, note: Schema.String }),
  ),
  byDay: Schema.Record(Schema.String, Schema.DateFromString),
  event: Schema.Union([
    Schema.Struct({ kind: Schema.Literal('due'), at: Schema.DateFromString }),
    Schema.Struct({ kind: Schema.Literal('none') }),
  ]),
})
  .evolve('v2', { rank: Schema.Finite }, (v1) => ({
    ...v1,
    rank: v1.createdAt.getUTCFullYear(),
  }))
  .build();

export const conformanceTable = StdTable.make('portable-conformance')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .entity(itemSchema, (e) =>
    e
      .primary({ pk: ['category'] })
      .index('LSI1', 'byValue', { sk: ['label'] })
      .index('GSI1', 'byLabel', { pk: ['category'], sk: ['label'] }),
  )
  .entity(otherItemSchema, (e) => e.primary({ pk: ['category'] }))
  .entity(compoundItemSchema, (e) =>
    e.primary({ pk: ['category'] }).index('GSI1', 'bySegment', {
      pk: ['category'],
      sk: ['segment', 'label'],
    }),
  )
  .singleEntity(configSchema, { default: { theme: 'light', count: 0 } })
  .entity(migratedSchema, (e) => e.primary({ pk: ['category'] }))
  .entity(docSchema, (e) =>
    e
      .primary({ pk: ['board.id'] })
      .index('LSI1', 'byRank', { sk: ['rank'] })
      .index('GSI1', 'byTeamSeat', {
        pk: ['owner.teamId'],
        sk: ['owner.seat'],
      }),
  )
  .entity(richSchema, (e) =>
    e
      .primary({ pk: ['category'] })
      .index('GSI1', 'byEventKind', { pk: ['event.kind'], sk: ['rank'] }),
  )
  .build();

const richValue = (richId: string, rank: number): typeof richSchema.Type => ({
  richId,
  category: 'rich',
  createdAt: new Date('2026-01-02T03:04:05.006Z'),
  size: 12345678901234567890n,
  closedAt: Option.some(DateTime.makeUnsafe('2026-02-01T00:00:00.000Z')),
  timeout: Duration.seconds(90),
  window: { from: new Date('2026-03-01T00:00:00.000Z'), to: null },
  history: [
    { at: new Date('2026-01-03T00:00:00.000Z'), note: 'opened' },
    { at: new Date('2026-01-04T00:00:00.000Z'), note: 'moved' },
  ],
  byDay: { monday: new Date('2026-01-05T00:00:00.000Z') },
  event: { kind: 'due', at: new Date('2026-04-01T00:00:00.000Z') },
  rank,
});

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

  const required = <T>(value: T | null): T => {
    expect(value).not.toBeNull();
    return value as T;
  };

  describe(`portable conformance: ${adapter.name}`, () => {
    it('inserts, reads, updates, tombstones, restores, and hard deletes', async () => {
      await run(
        Effect.gen(function* () {
          const inserted = yield* conformanceTable.Item.insert({
            itemId: 'one',
            category: 'a',
            label: 'one',
            value: 1,
          });
          expect(inserted.meta._d).toBe(false);
          expect(
            yield* conformanceTable.Item.get({
              itemId: 'missing',
              category: 'a',
            }),
          ).toBeNull();
          const duplicate = yield* conformanceTable.Item.insert({
            itemId: 'one',
            category: 'a',
            label: 'one',
            value: 1,
          }).pipe(Effect.result);
          expect(duplicate._tag).toBe('Failure');
          if (duplicate._tag === 'Failure')
            expect(duplicate.failure.reason._tag).toBe('ItemAlreadyExists');
          expect(
            (yield* conformanceTable.Item.get({ itemId: 'one', category: 'a' }))
              ?.value.value,
          ).toBe(1);

          const updated = yield* conformanceTable.Item.getAndUpdate(
            { itemId: 'one', category: 'a' },
            ({ value }) => ({ value: value + 1 }),
          );
          expect(updated.value.value).toBe(2);

          const deleted = yield* conformanceTable.Item.delete({
            itemId: 'one',
            category: 'a',
          });
          expect(deleted.meta._d).toBe(true);
          expect(
            (yield* conformanceTable.Item.get({ itemId: 'one', category: 'a' }))
              ?.meta._d,
          ).toBe(true);
          expect(
            yield* conformanceTable.Item.get(
              { itemId: 'one', category: 'a' },
              { excludeDeleted: true },
            ),
          ).toBeNull();

          expect(
            (yield* conformanceTable.Item.restore({
              itemId: 'one',
              category: 'a',
            })).meta._d,
          ).toBe(false);
          yield* conformanceTable.Item.hardDelete(
            { itemId: 'one', category: 'a' },
            'I KNOW WHAT I AM DOING',
          );
          expect(
            yield* conformanceTable.Item.get({ itemId: 'one', category: 'a' }),
          ).toBeNull();
        }),
      );
    });

    it('preserves metadata, skips no-op writes, and rejects primary key changes', async () => {
      const broadcasts: Entity<object>[] = [];
      const broadcaster = Layer.succeed(Broadcaster, {
        broadcast: (entities) => broadcasts.push(...entities),
        changes: Stream.empty,
      });
      await Effect.runPromise(
        Effect.gen(function* () {
          const inserted = yield* conformanceTable.Item.insert({
            itemId: 'stable',
            category: 'a',
            label: 'stable',
            value: 1,
          });
          expect(inserted.meta).toMatchObject({
            _e: 'Item',
            _d: false,
          });
          expect(inserted.meta).toHaveProperty('_v', 'v1');
          expect(inserted.meta._u).not.toBe('');

          const beforeRefusal = broadcasts.length;
          const refused = yield* conformanceTable.Item.getAndUpdate(
            { itemId: 'stable', category: 'a' },
            { value: 2 },
            { check: () => false },
          ).pipe(Effect.result);
          expect(refused).toMatchObject({
            _tag: 'Failure',
            failure: { reason: { _tag: 'CheckRefused' } },
          });
          expect(broadcasts).toHaveLength(beforeRefusal);

          const missing = yield* conformanceTable.Item.getAndUpdate(
            { itemId: 'missing', category: 'a' },
            { value: 2 },
          ).pipe(Effect.result);
          expect(missing).toMatchObject({
            _tag: 'Failure',
            failure: { reason: { _tag: 'NoItemToUpdate' } },
          });

          for (const update of [{ itemId: 'moved' }, { category: 'moved' }]) {
            const changedKey = yield* conformanceTable.Item.getAndUpdate(
              { itemId: 'stable', category: 'a' },
              update,
            ).pipe(Effect.result);
            expect(changedKey).toMatchObject({
              _tag: 'Failure',
              failure: {
                reason: { _tag: 'PrimaryKeyUpdateNotSupported' },
              },
            });
          }

          const liveRestore = yield* conformanceTable.Item.restore({
            itemId: 'stable',
            category: 'a',
          });
          expect(liveRestore.value).toEqual(inserted.value);
          expect(liveRestore.meta._d).toBe(false);
          expect(liveRestore.meta._u).not.toBe(inserted.meta._u);
          expect(broadcasts).toHaveLength(beforeRefusal + 1);
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
          yield* conformanceTable.Item.insert({
            ...key,
            label: 'ghost',
            value: 1,
          });
          const op = yield* conformanceTable.Item.getAndUpdateOp(key, {
            value: 2,
          });
          yield* conformanceTable.Item.hardDelete(
            key,
            'I KNOW WHAT I AM DOING',
          );

          const result = yield* conformanceTable
            .transact([op])
            .pipe(Effect.result);

          expect(result._tag).toBe('Failure');
          expect(yield* conformanceTable.Item.get(key)).toBeNull();
        }),
      );
    });

    it('commits transaction ops atomically and broadcasts after success', async () => {
      const broadcasts: Entity<object>[] = [];
      const broadcaster = Layer.succeed(Broadcaster, {
        broadcast: (entities) => broadcasts.push(...entities),
        changes: Stream.empty,
      });
      await Effect.runPromise(
        Effect.gen(function* () {
          const first = yield* conformanceTable.Item.insertOp({
            itemId: 'one',
            category: 'a',
            label: 'one',
            value: 1,
          });
          const second = yield* conformanceTable.Item.insertOp({
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
      const broadcasts: Entity<object>[] = [];
      const broadcaster = Layer.succeed(Broadcaster, {
        broadcast: (entities) => broadcasts.push(...entities),
        changes: Stream.empty,
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* conformanceTable.Item.insert({
            itemId: 'existing',
            category: 'a',
            label: 'existing',
            value: 1,
          });
          broadcasts.length = 0;

          const duplicate = yield* conformanceTable.Item.insertOp({
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

          const fresh = yield* conformanceTable.Item.insertOp({
            itemId: 'fresh',
            category: 'a',
            label: 'fresh',
            value: 1,
          });
          const conflicts = yield* conformanceTable.Item.insertOp({
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
            yield* conformanceTable.Item.get({
              itemId: 'fresh',
              category: 'a',
            }),
          ).toBeNull();
          expect(broadcasts).toHaveLength(0);
        }).pipe(
          Effect.provide(Layer.merge(adapter.makeLayer(), broadcaster)),
          Effect.provideService(Ulid, deterministicUlid),
        ),
      );
    });

    it('handles empty, stale, last-write-wins, mixed, and foreign transactions', async () => {
      const broadcasts: Entity<object>[] = [];
      const broadcaster = Layer.succeed(Broadcaster, {
        broadcast: (entities) => broadcasts.push(...entities),
        changes: Stream.empty,
      });
      await Effect.runPromise(
        Effect.gen(function* () {
          expect(yield* conformanceTable.transact([])).toEqual([]);
          expect(broadcasts).toEqual([]);

          yield* conformanceTable.Item.insert({
            itemId: 'stale',
            category: 'a',
            label: 'stale',
            value: 1,
          });
          // An op built before a concurrent write still commits: it reads at
          // commit time, so the interval before `transact` cannot make it stale.
          const held = yield* conformanceTable.Item.getAndUpdateOp(
            { itemId: 'stale', category: 'a' },
            (current) => ({ value: current.value + 1 }),
          );
          yield* conformanceTable.Item.getAndUpdate(
            { itemId: 'stale', category: 'a' },
            { value: 3 },
          );
          const fresh = yield* conformanceTable.Item.insertOp({
            itemId: 'fresh',
            category: 'a',
            label: 'fresh',
            value: 1,
          });
          yield* conformanceTable.transact([fresh, held]);
          expect(
            (yield* conformanceTable.Item.get({
              itemId: 'stale',
              category: 'a',
            }))?.value.value,
          ).toBe(4);
          expect(
            yield* conformanceTable.Item.get({
              itemId: 'fresh',
              category: 'a',
            }),
          ).not.toBeNull();

          // A refused entity invariant fails the batch before any submission.
          const refusedOp = yield* conformanceTable.Item.getAndUpdateOp(
            { itemId: 'stale', category: 'a' },
            { value: 5 },
            { check: (current) => current.value === 99 },
          );
          const refusedBatch = yield* conformanceTable
            .transact([refusedOp])
            .pipe(Effect.result);
          expect(refusedBatch).toMatchObject({
            _tag: 'Failure',
            failure: {
              reason: {
                _tag: 'TransactFailed',
                operations: [{ status: 'refused' }],
              },
            },
          });
          expect(
            (yield* conformanceTable.Item.get({
              itemId: 'stale',
              category: 'a',
            }))?.value.value,
          ).toBe(4);

          const lww = yield* conformanceTable.Item.getAndUpdateOp(
            { itemId: 'stale', category: 'a' },
            { value: 6 },
            { lastWriteWins: true },
          );
          yield* conformanceTable.Item.getAndUpdate(
            { itemId: 'stale', category: 'a' },
            { value: 5 },
          );
          yield* conformanceTable.transact([lww]);
          expect(
            (yield* conformanceTable.Item.get({
              itemId: 'stale',
              category: 'a',
            }))?.value.value,
          ).toBe(6);

          const deleteOp = yield* conformanceTable.Item.deleteOp({
            itemId: 'stale',
            category: 'a',
          });
          yield* conformanceTable.transact([deleteOp]);
          const tombstoned = yield* conformanceTable.Item.get({
            itemId: 'stale',
            category: 'a',
          });
          expect(tombstoned?.meta._d).toBe(true);

          // A redundant delete writes again: every op contributes one write,
          // so a batch stays atomic and its outcome report stays aligned.
          const redundant = yield* conformanceTable.Item.deleteOp({
            itemId: 'stale',
            category: 'a',
          });
          const beforeRedundant = broadcasts.length;
          yield* conformanceTable.transact([redundant]);
          const again = yield* conformanceTable.Item.get({
            itemId: 'stale',
            category: 'a',
          });
          expect(again?.meta._d).toBe(true);
          expect(again?.meta._u).not.toBe(tombstoned?.meta._u);
          expect(broadcasts).toHaveLength(beforeRedundant + 1);

          const restoreOp = yield* conformanceTable.Item.restoreOp({
            itemId: 'stale',
            category: 'a',
          });
          yield* conformanceTable.transact([restoreOp]);
          expect(
            (yield* conformanceTable.Item.get({
              itemId: 'stale',
              category: 'a',
            }))?.meta._d,
          ).toBe(false);

          const foreign = {
            tableName: 'portable-conformance-foreign',
            target: 'foreign',
            operationKind: 'insertOp',
            readsCurrent: false,
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

    it('prepares a check op from a current value and rejects invalid values before transact', async () => {
      await run(
        Effect.gen(function* () {
          const guardKey = { itemId: 'checked', category: 'a' };
          yield* conformanceTable.Item.insert({
            ...guardKey,
            label: 'checked',
            value: 1,
          });

          let checks = 0;
          const check = yield* conformanceTable.Item.getAndCheckOp(
            guardKey,
            (current) => {
              checks++;
              return current.value === 1;
            },
          );
          const write = yield* conformanceTable.Item.insertOp({
            itemId: 'behind-check',
            category: 'a',
            label: 'behind-check',
            value: 1,
          });
          expect(yield* conformanceTable.transact([check, write])).toEqual([
            null,
            expect.objectContaining({ value: expect.anything() }),
          ]);
          expect(checks).toBe(1);

          const refused = yield* conformanceTable
            .transact([
              yield* conformanceTable.Item.getAndCheckOp(guardKey, () => false),
            ])
            .pipe(Effect.result);
          expect(refused).toMatchObject({
            _tag: 'Failure',
            failure: {
              reason: {
                _tag: 'TransactFailed',
                operations: [{ status: 'refused', detail: 'CheckRefused' }],
              },
            },
          });

          const truthy = yield* conformanceTable
            .transact([
              yield* conformanceTable.Item.getAndCheckOp(
                guardKey,
                () => 1 as never,
              ),
            ])
            .pipe(Effect.result);
          expect(truthy).toMatchObject({
            _tag: 'Failure',
            failure: { reason: { operations: [{ status: 'refused' }] } },
          });

          const missing = yield* conformanceTable
            .transact([
              yield* conformanceTable.Item.getAndCheckOp(
                { itemId: 'missing-check', category: 'a' },
                () => true,
              ),
            ])
            .pipe(Effect.result);
          expect(missing).toMatchObject({
            _tag: 'Failure',
            failure: {
              reason: {
                _tag: 'TransactFailed',
                operations: [{ status: 'missing', detail: 'NoItemToCheck' }],
              },
            },
          });

          yield* conformanceTable.Item.delete(guardKey);
          let checkedTombstone = false;
          const tombstoned = yield* conformanceTable
            .transact([
              yield* conformanceTable.Item.getAndCheckOp(guardKey, () => {
                checkedTombstone = true;
                return true;
              }),
            ])
            .pipe(Effect.result);
          expect(tombstoned).toMatchObject({
            _tag: 'Failure',
            failure: { reason: { operations: [{ status: 'missing' }] } },
          });
          expect(checkedTombstone).toBe(false);
        }),
      );
    });

    it('reads a get-and-check entity at commit time, not at preparation', async () => {
      await run(
        Effect.gen(function* () {
          const guardKey = { itemId: 'checked-stale', category: 'a' };
          yield* conformanceTable.Item.insert({
            ...guardKey,
            label: 'checked-stale',
            value: 1,
          });
          // The invariant names the value transact will read, not the value
          // that was current when the op was built.
          const check = yield* conformanceTable.Item.getAndCheckOp(
            guardKey,
            ({ value }) => value === 2,
          );
          yield* conformanceTable.Item.getAndUpdate(guardKey, { value: 2 });
          const write = yield* conformanceTable.Item.insertOp({
            itemId: 'behind-fresh-check',
            category: 'a',
            label: 'behind-fresh-check',
            value: 1,
          });

          yield* conformanceTable.transact([check, write]);
          expect(
            yield* conformanceTable.Item.get({
              itemId: 'behind-fresh-check',
              category: 'a',
            }),
          ).not.toBeNull();
        }),
      );
    });

    it('commits behind a passing check and rolls back every write behind a failing one', async () => {
      await run(
        Effect.gen(function* () {
          const guard = yield* conformanceTable.Item.insert({
            itemId: 'guard',
            category: 'a',
            label: 'guard',
            value: 1,
          });
          const written = yield* conformanceTable.Item.insertOp({
            itemId: 'written',
            category: 'a',
            label: 'written',
            value: 1,
          });
          expect(
            yield* conformanceTable.transact([
              written,
              yield* conformanceTable.Item.unchangedOp(guard),
            ]),
          ).toEqual([
            expect.objectContaining({ value: expect.anything() }),
            null,
          ]);
          expect(
            yield* conformanceTable.Item.get({
              itemId: 'written',
              category: 'a',
            }),
          ).not.toBeNull();

          yield* conformanceTable.Item.getAndUpdate(
            { itemId: 'guard', category: 'a' },
            {
              value: 2,
            },
          );
          const blocked = yield* conformanceTable.Item.insertOp({
            itemId: 'blocked',
            category: 'a',
            label: 'blocked',
            value: 1,
          });
          const stale = yield* conformanceTable
            .transact([
              blocked,
              yield* conformanceTable.Item.unchangedOp(guard),
            ])
            .pipe(Effect.result);
          expect(stale._tag).toBe('Failure');
          expect(
            yield* conformanceTable.Item.get({
              itemId: 'blocked',
              category: 'a',
            }),
          ).toBeNull();

          const current = required(
            yield* conformanceTable.Item.get({
              itemId: 'guard',
              category: 'a',
            }),
          );
          yield* conformanceTable.Item.delete({
            itemId: 'guard',
            category: 'a',
          });
          const afterDelete = yield* conformanceTable
            .transact([yield* conformanceTable.Item.unchangedOp(current)])
            .pipe(Effect.result);
          expect(afterDelete._tag).toBe('Failure');
          expect(
            yield* conformanceTable.transact([
              yield* conformanceTable.Item.existsOp({
                itemId: 'guard',
                category: 'a',
              }),
            ]),
          ).toEqual([null]);
        }),
      );
    });

    it('reports every operation when a transacted check fails', async () => {
      await run(
        Effect.gen(function* () {
          const first = yield* conformanceTable.Item.insert({
            itemId: 'first',
            category: 'a',
            label: 'first',
            value: 1,
          });
          const second = yield* conformanceTable.Item.insert({
            itemId: 'second',
            category: 'a',
            label: 'second',
            value: 1,
          });
          yield* conformanceTable.Item.getAndUpdate(
            { itemId: 'second', category: 'a' },
            {
              value: 9,
            },
          );

          const write = yield* conformanceTable.Item.insertOp({
            itemId: 'third',
            category: 'a',
            label: 'third',
            value: 1,
          });
          const failed = yield* conformanceTable
            .transact([
              yield* conformanceTable.Item.unchangedOp(first),
              yield* conformanceTable.Item.unchangedOp(second),
              write,
            ])
            .pipe(Effect.result);
          expect(failed._tag).toBe('Failure');
          if (failed._tag === 'Failure') {
            const reason = failed.failure.reason;
            expect(reason._tag).toBe('TransactFailed');
            if (reason._tag === 'TransactFailed') {
              expect(
                reason.operations.map((entry) => entry.op.operationKind),
              ).toEqual(['checkOp', 'checkOp', 'insertOp']);
              expect(
                reason.operations.map((entry) => entry.op.entityName),
              ).toEqual(['Item', 'Item', 'Item']);
              expect(reason.operations[0]?.status).toBe('passed');
              expect(reason.operations[1]?.status).toBe('stale');
              expect(reason.operations[2]?.op).toBe(write);
            }
          }
          expect(
            yield* conformanceTable.Item.get({
              itemId: 'third',
              category: 'a',
            }),
          ).toBeNull();

          const refusedEarly = yield* conformanceTable
            .transact([
              yield* conformanceTable.Item.unchangedOp(first),
              yield* conformanceTable.Item.unchangedOp(second),
              yield* conformanceTable.Item.getAndUpdateOp(
                { itemId: 'absent', category: 'a' },
                { value: 1 },
              ),
            ])
            .pipe(Effect.result);
          expect(refusedEarly).toMatchObject({
            _tag: 'Failure',
            failure: {
              reason: {
                _tag: 'TransactFailed',
                operations: [
                  { status: 'not-evaluated' },
                  { status: 'not-evaluated' },
                  { status: 'missing', detail: 'NoItemToUpdate' },
                ],
              },
            },
          });

          const refreshed = required(
            yield* conformanceTable.Item.get({
              itemId: 'second',
              category: 'a',
            }),
          );
          expect(
            yield* conformanceTable.transact([
              yield* conformanceTable.Item.unchangedOp(first),
              yield* conformanceTable.Item.unchangedOp(refreshed),
              yield* conformanceTable.Item.notExistsOp({
                itemId: 'absent',
                category: 'a',
              }),
            ]),
          ).toEqual([null, null, null]);

          const update = yield* conformanceTable.Item.getAndUpdateOp(
            { itemId: 'first', category: 'a' },
            { value: 5 },
          );
          const duplicate = yield* conformanceTable
            .transact([update, yield* conformanceTable.Item.unchangedOp(first)])
            .pipe(Effect.result);
          expect(duplicate).toMatchObject({
            _tag: 'Failure',
            failure: { reason: { _tag: 'DuplicateTransactionTarget' } },
          });
        }),
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
            yield* conformanceTable.Item.insert({
              itemId,
              category: 'a',
              label,
              value: 1,
            });
          }
          yield* conformanceTable.Item.delete({ itemId: 'two', category: 'a' });

          const first = yield* conformanceTable.Item.query(
            'byLabel',
            { pk: { category: 'a' }, beginsWith: { label: '' } },
            { limit: 2, excludeDeleted: true },
          );
          expect(first.items.map(({ value }) => value.itemId)).toEqual([
            'one',
            'three',
          ]);
          expect(first.hasMore).toBe(true);

          const second = yield* conformanceTable.Item.query(
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

          const descending = yield* conformanceTable.Item.query(
            'byLabel',
            { pk: { category: 'a' }, '<=': null },
            { limit: 2 },
          );
          expect(descending.items.map(({ value }) => value.itemId)).toEqual([
            'four',
            'three',
          ]);
          expect(descending.hasMore).toBe(true);
          const descendingRest = yield* conformanceTable.Item.query(
            'byLabel',
            { pk: { category: 'a' }, '<=': null },
            { after: descending.items.at(-1)! },
          );
          expect(descendingRest.items.map(({ value }) => value.itemId)).toEqual(
            ['two', 'one'],
          );
          expect(descendingRest.hasMore).toBe(false);

          const primary = yield* conformanceTable.Item.query(
            'primary',
            { pk: { category: 'a' }, '>=': null },
            { limit: 3 },
          );
          expect(primary.hasMore).toBe(true);
          const primaryRest = yield* conformanceTable.Item.query(
            'primary',
            { pk: { category: 'a' }, '>=': null },
            { after: primary.items.at(-1)! },
          );
          expect(primaryRest.items.length).toBe(1);
          expect(primaryRest.hasMore).toBe(false);

          for (const itemId of ['tie-1', 'tie-2', 'tie-3']) {
            yield* conformanceTable.Item.insert({
              itemId,
              category: 'ties',
              label: 'same',
              value: 1,
            });
          }
          const seen: string[] = [];
          let page = yield* conformanceTable.Item.query(
            'byLabel',
            { pk: { category: 'ties' }, '=': { label: 'same' } },
            { limit: 1 },
          );
          seen.push(...page.items.map(({ value }) => value.itemId));
          while (page.hasMore) {
            page = yield* conformanceTable.Item.query(
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
          const initial = yield* conformanceTable.Config.get();
          expect(initial.value).toEqual({ theme: 'light', count: 0 });
          expect(initial.meta).toEqual({
            _e: 'Config',
            _v: 'v1',
            _u: '',
          });

          const missingOp = yield* conformanceTable
            .transact([
              yield* conformanceTable.Config.getAndUpdateOp({ theme: 'dark' }),
            ])
            .pipe(Effect.result);
          expect(missingOp).toMatchObject({
            _tag: 'Failure',
            failure: {
              reason: {
                _tag: 'TransactFailed',
                operations: [{ status: 'missing', detail: 'NoItemToUpdate' }],
              },
            },
          });

          const updated = yield* conformanceTable.Config.getAndUpdate(
            ({ count }) => ({
              theme: 'dark',
              count: count + 1,
            }),
          );
          expect(updated.value).toEqual({ theme: 'dark', count: 1 });
          const refusedSingle = yield* conformanceTable.Config.getAndUpdate(
            { count: 99 },
            { check: () => false },
          ).pipe(Effect.result);
          expect(refusedSingle).toMatchObject({
            _tag: 'Failure',
            failure: { reason: { _tag: 'CheckRefused' } },
          });
          expect(yield* conformanceTable.Config.get()).toEqual(updated);

          const op = yield* conformanceTable.Config.getAndUpdateOp({
            count: 2,
          });
          yield* conformanceTable.transact([op]);
          expect((yield* conformanceTable.Config.get()).value.count).toBe(2);

          // A held op reads at commit time, so a concurrent write does not
          // make it stale; an invariant is what a caller guards a decision with.
          const held = yield* conformanceTable.Config.getAndUpdateOp(
            ({ count }) => ({
              count: count + 1,
            }),
          );
          yield* conformanceTable.Config.getAndUpdate({ count: 4 });
          yield* conformanceTable.transact([held]);
          expect((yield* conformanceTable.Config.get()).value.count).toBe(5);

          const refusedOp = yield* conformanceTable.Config.getAndUpdateOp(
            { count: 7 },
            { check: ({ count }) => count === 99 },
          );
          const refusedBatch = yield* conformanceTable
            .transact([refusedOp])
            .pipe(Effect.result);
          expect(refusedBatch).toMatchObject({
            _tag: 'Failure',
            failure: {
              reason: {
                _tag: 'TransactFailed',
                operations: [{ status: 'refused' }],
              },
            },
          });
          expect((yield* conformanceTable.Config.get()).value.count).toBe(5);

          const lww = yield* conformanceTable.Config.getAndUpdateOp(
            { count: 8 },
            { lastWriteWins: true },
          );
          yield* conformanceTable.Config.getAndUpdate({ count: 6 });
          yield* conformanceTable.transact([lww]);
          expect((yield* conformanceTable.Config.get()).value.count).toBe(8);

          const reset = yield* conformanceTable.Config.reset();
          expect(reset.value).toEqual({ theme: 'light', count: 0 });
          expect(reset.meta._u).not.toBe('');
          expect(yield* conformanceTable.Config.get()).toEqual(reset);
        }),
      );
    });

    it('removes only the selected entity type', async () => {
      await run(
        Effect.gen(function* () {
          yield* conformanceTable.Item.insert({
            itemId: 'remove',
            category: 'a',
            label: 'remove',
            value: 1,
          });
          yield* conformanceTable.OtherItem.insert({
            itemId: 'keep',
            category: 'a',
            label: 'keep',
          });
          expect(
            yield* conformanceTable.Item.dangerouslyRemoveAllItems(
              'I KNOW WHAT I AM DOING',
            ),
          ).toEqual({ itemsDeleted: 1 });
          expect(
            yield* conformanceTable.Item.get({
              itemId: 'remove',
              category: 'a',
            }),
          ).toBeNull();
          expect(
            yield* conformanceTable.OtherItem.get({
              itemId: 'keep',
              category: 'a',
            }),
          ).not.toBeNull();
          expect(
            yield* conformanceTable.dangerouslyRemoveAllItems(
              'I KNOW WHAT I AM DOING',
            ),
          ).toEqual({ itemsDeleted: 1 });
          expect(
            yield* conformanceTable.OtherItem.get({
              itemId: 'keep',
              category: 'a',
            }),
          ).toBeNull();
        }),
      );
    });

    it('supports every portable sort condition and direction', async () => {
      await run(
        Effect.gen(function* () {
          for (const label of ['a', 'b', 'c', 'd']) {
            yield* conformanceTable.Item.insert({
              itemId: label,
              category: 'a',
              label,
              value: 1,
            });
          }

          const less = yield* conformanceTable.Item.query('byLabel', {
            pk: { category: 'a' },
            '<': { label: 'd' },
          });
          expect(less.items.map(({ value }) => value.label)).toEqual([
            'c',
            'b',
            'a',
          ]);
          const greater = yield* conformanceTable.Item.query('byLabel', {
            pk: { category: 'a' },
            '>=': { label: 'c' },
          });
          expect(greater.items.map(({ value }) => value.label)).toEqual([
            'c',
            'd',
          ]);
          const lessOrEqual = yield* conformanceTable.Item.query('byLabel', {
            pk: { category: 'a' },
            '<=': { label: 'b' },
          });
          expect(lessOrEqual.items.map(({ value }) => value.label)).toEqual([
            'b',
            'a',
          ]);
          const greaterThan = yield* conformanceTable.Item.query('byLabel', {
            pk: { category: 'a' },
            '>': { label: 'b' },
          });
          expect(greaterThan.items.map(({ value }) => value.label)).toEqual([
            'c',
            'd',
          ]);
          const between = yield* conformanceTable.Item.query('byLabel', {
            pk: { category: 'a' },
            between: [{ label: 'b' }, { label: 'c' }],
          });
          expect(between.items.map(({ value }) => value.label)).toEqual([
            'b',
            'c',
          ]);
          const exact = yield* conformanceTable.Item.query('byLabel', {
            pk: { category: 'a' },
            '=': { label: 'b' },
          });
          expect(exact.items.map(({ value }) => value.label)).toEqual(['b']);
          const lsi = yield* conformanceTable.Item.query('byValue', {
            pk: { category: 'a' },
            beginsWith: { label: 'c' },
          });
          expect(lsi.items.map(({ value }) => value.label)).toEqual(['c']);

          const primary = yield* conformanceTable.Item.query('primary', {
            pk: { category: 'a' },
            beginsWith: { itemId: 'b' },
          });
          expect(primary.items.map(({ value }) => value.itemId)).toEqual(['b']);

          const unboundedAscending = yield* conformanceTable.Item.query(
            'primary',
            {
              pk: { category: 'a' },
              '>=': null,
            },
          );
          expect(
            unboundedAscending.items.map(({ value }) => value.itemId),
          ).toEqual(['a', 'b', 'c', 'd']);
          const unboundedDescending = yield* conformanceTable.Item.query(
            'primary',
            {
              pk: { category: 'a' },
              '<=': null,
            },
          );
          expect(
            unboundedDescending.items.map(({ value }) => value.itemId),
          ).toEqual(['d', 'c', 'b', 'a']);

          expect(
            (yield* conformanceTable.Item.query('primary', {
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
            yield* conformanceTable.CompoundItem.insert(value);
          }

          const compound = yield* conformanceTable.CompoundItem.query(
            'bySegment',
            {
              pk: { category: 'a' },
              beginsWith: { segment: 'one', label: 'alp' },
            },
          );
          expect(compound.items.map(({ value }) => value.itemId)).toEqual([
            'a',
            'b',
          ]);
          expect(compound.items.some(({ value }) => value.itemId === 'd')).toBe(
            false,
          );

          for (const effect of [
            conformanceTable.CompoundItem.query(
              'missing' as never,
              {
                pk: { category: 'a' },
                '>=': null,
              } as never,
            ),
            conformanceTable.CompoundItem.query(
              'primary',
              {
                pk: { category: 'a' },
                '>=': null,
              },
              { limit: 0 },
            ),
            conformanceTable.CompoundItem.query('primary', {
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

    it('keys rich values by key path, orders numbers, and skips absent branches', async () => {
      await run(
        Effect.gen(function* () {
          const dueAt = new Date('2026-09-01T09:00:00.000Z');
          const ranks = [10, -2.5, 9, 0, 100];
          for (const [index, rank] of ranks.entries()) {
            yield* conformanceTable.Doc.insert({
              docId: `d${index}`,
              board: { id: 'work' },
              rank,
              dueAt,
              owner:
                index % 2 === 0
                  ? { kind: 'team', teamId: 'core', seat: rank }
                  : { kind: 'user', userId: `u${index}` },
            });
          }

          const read = required(
            yield* conformanceTable.Doc.get({
              'board.id': 'work',
              docId: 'd0',
            }),
          );
          expect(read.value.dueAt).toBeInstanceOf(Date);
          expect(read.value.dueAt.getTime()).toBe(dueAt.getTime());

          const byRank = yield* conformanceTable.Doc.query('byRank', {
            pk: { 'board.id': 'work' },
            '>=': null,
          });
          expect(byRank.items.map(({ value }) => value.rank)).toEqual([
            -2.5, 0, 9, 10, 100,
          ]);
          const above = yield* conformanceTable.Doc.query('byRank', {
            pk: { 'board.id': 'work' },
            '>': { rank: 9 },
          });
          expect(above.items.map(({ value }) => value.rank)).toEqual([10, 100]);
          const firstPage = yield* conformanceTable.Doc.query(
            'byRank',
            { pk: { 'board.id': 'work' }, '>=': null },
            { limit: 2 },
          );
          const secondPage = yield* conformanceTable.Doc.query(
            'byRank',
            { pk: { 'board.id': 'work' }, '>=': null },
            { limit: 2, after: firstPage.items.at(-1)! },
          );
          expect(secondPage.items.map(({ value }) => value.rank)).toEqual([
            9, 10,
          ]);

          const team = yield* conformanceTable.Doc.query('byTeamSeat', {
            pk: { 'owner.teamId': 'core' },
            '>=': null,
          });
          // User-owned docs have no teamId, so they are not in this index.
          expect(team.items.map(({ value }) => value.docId)).toEqual([
            'd2',
            'd0',
            'd4',
          ]);

          const later = new Date('2027-01-01T00:00:00.000Z');
          const updated = yield* conformanceTable.Doc.getAndUpdate(
            { 'board.id': 'work', docId: 'd1' },
            { dueAt: later },
          );
          expect(updated.value.dueAt.getTime()).toBe(later.getTime());
        }),
      );
    });

    it('defaults query pages to 100 returned entities', async () => {
      await run(
        Effect.gen(function* () {
          for (let index = 0; index < 101; index++) {
            const id = String(index).padStart(3, '0');
            yield* conformanceTable.Item.insert({
              itemId: id,
              category: 'default-limit',
              label: id,
              value: index,
            });
          }
          const first = yield* conformanceTable.Item.query('primary', {
            pk: { category: 'default-limit' },
            '>=': null,
          });
          expect(first.items).toHaveLength(100);
          expect(first.hasMore).toBe(true);
          const second = yield* conformanceTable.Item.query(
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
        const inserted = yield* conformanceTable.MigratedItem.insert({
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
          },
          condition: { kind: 'updated', value: inserted.meta._u },
        });

        const migrated = yield* conformanceTable.MigratedItem.get({
          itemId: 'one',
          category: 'a',
        });
        expect(migrated?.value.note).toBe('migrated');
        expect(migrated?.meta).toHaveProperty('_v', 'v2');
        expect((yield* contract.getItem(key))?.data._v).toBe('v1');
      }),
    );
  });

  it('round-trips arbitrarily nested converted values and migrates them', async () => {
    await run(
      Effect.gen(function* () {
        const original = richValue('r1', 7);
        const inserted = yield* conformanceTable.Rich.insert(original);
        expect(Equal.equals(inserted.value, original)).toBe(true);

        // Storage holds plain JSON: strings, numbers, and nulls, never objects
        // like Date, BigInt, Option, or Duration.
        const contract = (yield* StdTableService(conformanceTable.logicalName))
          .contract;
        const key = {
          pk: encodeCompositeKey(['Rich', 'rich']),
          sk: encodeCompositeKey(['r1']),
        };
        const stored = yield* contract.getItem(key);
        expect(JSON.parse(JSON.stringify(stored!.data))).toEqual(stored!.data);
        expect(stored!.data).toMatchObject({
          _v: 'v2',
          createdAt: '2026-01-02T03:04:05.006Z',
          size: '12345678901234567890',
          closedAt: '2026-02-01T00:00:00.000Z',
          timeout: 90_000,
          window: { _v: 'v1', from: '2026-03-01T00:00:00.000Z', to: null },
          history: [{ at: '2026-01-03T00:00:00.000Z', note: 'opened' }, {}],
          byDay: { monday: '2026-01-05T00:00:00.000Z' },
          event: { kind: 'due', at: '2026-04-01T00:00:00.000Z' },
        });

        const read = required(
          yield* conformanceTable.Rich.get({ category: 'rich', richId: 'r1' }),
        );
        expect(Equal.equals(read.value, original)).toBe(true);
        expect(read.value.createdAt).toBeInstanceOf(Date);
        expect(read.value.size).toBe(12345678901234567890n);
        expect(Duration.toMillis(read.value.timeout)).toBe(90_000);

        const moved = new Date('2026-05-01T00:00:00.000Z');
        const updated = yield* conformanceTable.Rich.getAndUpdate(
          { category: 'rich', richId: 'r1' },
          (current) => ({
            history: [...current.history, { at: moved, note: 'closed' }],
            closedAt: Option.none(),
          }),
        );
        expect(updated.value.history.at(-1)?.at.getTime()).toBe(
          moved.getTime(),
        );
        expect(Option.isNone(updated.value.closedAt)).toBe(true);

        const byKind = yield* conformanceTable.Rich.query('byEventKind', {
          pk: { 'event.kind': 'due' },
          '>=': null,
        });
        expect(byKind.items.map(({ value }) => value.richId)).toEqual(['r1']);

        // A row written by v1 code: its migration receives a real Date.
        const { rank: _rank, ...v1Data } = (yield* contract.getItem(key))!.data;
        yield* contract.writeItem({
          item: {
            ...(yield* contract.getItem(key))!,
            data: { ...v1Data, _v: 'v1' },
          },
          condition: { kind: 'updated', value: updated.meta._u },
        });
        const migrated = required(
          yield* conformanceTable.Rich.get({ category: 'rich', richId: 'r1' }),
        );
        expect(migrated.meta._v).toBe('v2');
        expect(migrated.value.rank).toBe(2026);
        expect(migrated.value.history).toHaveLength(3);
      }),
    );
  });

  it('filters Change Notices by converted values', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const byDate = yield* Effect.forkChild(
          Stream.runCollect(
            conformanceTable.Rich.subscribe({
              createdAt: new Date('2026-01-02T03:04:05.006Z'),
            }).pipe(Stream.take(1)),
          ),
        );
        const byNested = yield* Effect.forkChild(
          Stream.runCollect(
            conformanceTable.Rich.subscribe({
              window: {
                from: new Date('2026-03-01T00:00:00.000Z'),
                to: null,
              },
              closedAt: Option.some(
                DateTime.makeUnsafe('2026-02-01T00:00:00.000Z'),
              ),
            }).pipe(Stream.take(1)),
          ),
        );
        yield* Effect.sleep('20 millis');

        yield* conformanceTable.Rich.insert({
          ...richValue('other', 1),
          createdAt: new Date('2030-01-01T00:00:00.000Z'),
          window: { from: new Date('2030-01-01T00:00:00.000Z'), to: null },
        });
        yield* conformanceTable.Rich.insert(richValue('match', 2));

        const [dateNotices, nestedNotices] = [
          yield* Fiber.join(byDate),
          yield* Fiber.join(byNested),
        ];
        expect(dateNotices.map(({ value }) => value.richId)).toEqual(['match']);
        expect(nestedNotices.map(({ value }) => value.richId)).toEqual([
          'match',
        ]);
      }).pipe(
        Effect.provide(Layer.merge(adapter.makeLayer(), defaultBroadcaster)),
        Effect.provideService(Ulid, deterministicUlid),
      ),
    );
  });

  it('normalizes schema decoding failures', async () => {
    await run(
      Effect.gen(function* () {
        const inserted = yield* conformanceTable.Item.insert({
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
        const result = yield* conformanceTable.Item.get({
          itemId: 'invalid',
          category: 'a',
        }).pipe(Effect.result);
        expect(result).toMatchObject({
          _tag: 'Failure',
          failure: { reason: { _tag: 'DecodeFailed' } },
        });
      }),
    );
  });

  it('delivers Change Notices to entity-filtered and table-wide subscribers', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const filtered = yield* Effect.forkChild(
          Stream.runCollect(
            conformanceTable.Item.subscribe({ category: 'notify' }).pipe(
              Stream.take(1),
            ),
          ),
        );
        const tableWide = yield* Effect.forkChild(
          Stream.runCollect(conformanceTable.subscribe().pipe(Stream.take(2))),
        );
        yield* Effect.sleep('20 millis');

        yield* conformanceTable.Item.insert({
          itemId: 'skip',
          category: 'ignore',
          label: 'skip',
          value: 1,
        });
        yield* conformanceTable.Item.insert({
          itemId: 'match',
          category: 'notify',
          label: 'match',
          value: 1,
        });

        const notices = yield* Fiber.join(filtered);
        expect(notices).toHaveLength(1);
        expect(notices[0]?.value).toMatchObject({
          itemId: 'match',
          category: 'notify',
        });

        expect(yield* Fiber.join(tableWide)).toHaveLength(2);
      }).pipe(
        Effect.provide(Layer.merge(adapter.makeLayer(), defaultBroadcaster)),
        Effect.provideService(Ulid, deterministicUlid),
      ),
    );
  });
};
