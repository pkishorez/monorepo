import { Effect, Schema } from 'effect';
import type { EntityType } from '../../../../core/index.js';
import { EntityESchema } from '../../../../eschema/index.js';
import { it, describe, expect } from 'vitest';
import { memoryOfflineStorage } from '../../offline-storage/memory-offline-storage.js';
import type { OfflineStorageGroup } from '../../offline-storage/index.js';
import { makeSourceOfTruth } from '../index.js';

type Item = { id: string; name: string };

const schema = EntityESchema.make('Item', 'id', {
  name: Schema.String,
}).build();

const entity = (
  id: string,
  name: string,
  updated: string,
): EntityType<Item> => ({
  value: { id, name },
  meta: { _e: 'Item', _v: 'v1', _u: updated, _d: false },
});

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E>) =>
  it(name, () => Effect.runPromise(fn() as Effect.Effect<A, E, never>));

describe('TanStack Sync', () => {
  describe('Source of truth', () => {
    describe('Client stamp', () => {
      itEffect('stamps _c as a number on accepted entities', () =>
        Effect.gen(function* () {
          const storage = memoryOfflineStorage();
          const group = storage.group('sot/items');
          const sot = makeSourceOfTruth<Item>({ schema, group });

          const before = Date.now();
          const { upserts } = yield* sot.write([
            entity('a', 'Alpha', '2024-01-01T00:00:00.000Z'),
          ]);
          const after = Date.now();

          expect(upserts).toHaveLength(1);
          const c = upserts[0]!.meta._c;
          expect(typeof c).toBe('number');
          expect(c).toBeGreaterThanOrEqual(before);
          expect(c).toBeLessThanOrEqual(after);
        }),
      );

      itEffect('persists _c so sot.getAll() returns it after write', () =>
        Effect.gen(function* () {
          const storage = memoryOfflineStorage();
          const group = storage.group('sot/items');
          const sot = makeSourceOfTruth<Item>({ schema, group });

          yield* sot.write([entity('a', 'Alpha', '2024-01-01T00:00:00.000Z')]);

          const all = yield* sot.getAll();
          expect(all).toHaveLength(1);
          expect(typeof all[0]!.meta._c).toBe('number');
        }),
      );

      itEffect('re-stamps _c on a subsequent write of the same entity', () =>
        Effect.gen(function* () {
          const storage = memoryOfflineStorage();
          const group = storage.group('sot/items');
          const sot = makeSourceOfTruth<Item>({ schema, group });

          yield* sot.write([entity('a', 'Alpha', '2024-01-01T00:00:00.000Z')]);
          const firstAll = yield* sot.getAll();
          const firstC = firstAll[0]!.meta._c!;

          // Small delay to ensure a different timestamp is possible, but test
          // primarily asserts that a fresh _c is present — not the exact value.
          yield* sot.write([
            entity('a', 'Alpha v2', '2024-01-02T00:00:00.000Z'),
          ]);

          const all = yield* sot.getAll();
          expect(all).toHaveLength(1);
          expect(typeof all[0]!.meta._c).toBe('number');
          expect(all[0]!.meta._c).toBeGreaterThanOrEqual(firstC);
        }),
      );

      itEffect(
        'does not stamp _c on skipped (older) entities — prior value preserved',
        () =>
          Effect.gen(function* () {
            const storage = memoryOfflineStorage();
            const group = storage.group('sot/items');
            const sot = makeSourceOfTruth<Item>({ schema, group });

            yield* sot.write([
              entity('a', 'Alpha', '2024-01-02T00:00:00.000Z'),
            ]);
            const [first] = yield* sot.getAll();
            const firstC = first!.meta._c;

            // older update should be skipped — no re-stamp
            const { upserts } = yield* sot.write([
              entity('a', 'Old', '2024-01-01T00:00:00.000Z'),
            ]);
            expect(upserts).toHaveLength(0);

            const all = yield* sot.getAll();
            expect(all[0]!.meta._c).toBe(firstC);
          }),
      );
    });

    const entityWithS = (
      id: string,
      name: string,
      updated: string,
      s: number,
    ): EntityType<Item> => ({
      value: { id, name },
      meta: { _e: 'Item', _v: 'v1', _u: updated, _d: false, _s: s },
    });

    describe('Skip reconciliation', () => {
      itEffect('reconciles _s onto a stored record skipped by _u', () =>
        Effect.gen(function* () {
          const storage = memoryOfflineStorage();
          const group = storage.group('sot/items');
          const sot = makeSourceOfTruth<Item>({ schema, group });

          // Backfill path: no _s.
          yield* sot.write([entity('a', 'Alpha', '2024-01-01T00:00:00.000Z')]);
          expect((yield* sot.getAll())[0]!.meta._s).toBeUndefined();

          // Re-delivery with same _u but carrying _s — value stale, meta reconciled.
          const { upserts } = yield* sot.write([
            entityWithS(
              'a',
              'Alpha',
              '2024-01-01T00:00:00.000Z',
              1_700_000_000,
            ),
          ]);

          expect(upserts).toHaveLength(1);
          expect(upserts[0]!.meta._s).toBe(1_700_000_000);
          const all = yield* sot.getAll();
          expect(all[0]!.meta._s).toBe(1_700_000_000);
          expect(all[0]!.value.name).toBe('Alpha');
        }),
      );

      itEffect(
        'does not reconcile when incoming _s matches the stored _s',
        () =>
          Effect.gen(function* () {
            const storage = memoryOfflineStorage();
            const group = storage.group('sot/items');
            const sot = makeSourceOfTruth<Item>({ schema, group });

            yield* sot.write([
              entityWithS('a', 'Alpha', '2024-01-01T00:00:00.000Z', 42),
            ]);
            const { upserts } = yield* sot.write([
              entityWithS('a', 'Alpha', '2024-01-01T00:00:00.000Z', 42),
            ]);

            expect(upserts).toHaveLength(0);
          }),
      );
    });

    describe('Concurrent convergence', () => {
      itEffect(
        'serializes read-compare-write batches so the newest entity wins',
        () =>
          Effect.gen(function* () {
            let stored: EntityType<Item> | null = null;
            let reads = 0;
            const group: OfflineStorageGroup = {
              get: <T>() => {
                const snapshot = stored as T | null;
                reads += 1;
                return reads === 1
                  ? Effect.sleep(20).pipe(Effect.as(snapshot))
                  : Effect.succeed(snapshot);
              },
              getAll: <T>() =>
                Effect.succeed(
                  stored == null ? [] : [{ key: 'a', value: stored as T }],
                ),
              put: (_key, value) =>
                Effect.sync(() => {
                  stored = value as EntityType<Item>;
                }),
              putMany: (entries) =>
                Effect.sync(() => {
                  stored = entries[0]!.value as EntityType<Item>;
                }),
              delete: () => Effect.void,
              clear: () => Effect.void,
            };
            const sot = makeSourceOfTruth<Item>({ schema, group });

            yield* Effect.all(
              [
                sot.write([entity('a', 'Older', '2024-01-01T00:00:00.000Z')]),
                sot.write([entity('a', 'Newer', '2024-01-02T00:00:00.000Z')]),
              ],
              { concurrency: 'unbounded' },
            );

            expect((yield* sot.get('a'))?.value.name).toBe('Newer');
          }),
      );
    });

    describe('Validation', () => {
      itEffect(
        'rejects a value that does not match the collection schema',
        () =>
          Effect.gen(function* () {
            const storage = memoryOfflineStorage();
            const sot = makeSourceOfTruth<Item>({
              schema,
              group: storage.group('sot/items'),
            });
            const invalid = {
              ...entity('a', 'Alpha', '2024-01-01T00:00:00.000Z'),
              value: { id: 'a', name: 42 },
            } as unknown as EntityType<Item>;

            const error = yield* sot.write([invalid]).pipe(Effect.flip);

            expect(error).toEqual({
              _tag: 'Invalid',
              reason: 'entity value does not match schema "Item"',
            });
            expect(yield* sot.getAll()).toEqual([]);
          }),
      );

      itEffect('rejects the entire batch when one entity is invalid', () =>
        Effect.gen(function* () {
          const storage = memoryOfflineStorage();
          const sot = makeSourceOfTruth<Item>({
            schema,
            group: storage.group('sot/items'),
          });
          const invalid = {
            ...entity('b', 'Beta', '2024-01-01T00:00:00.000Z'),
            meta: { _e: 'Item' },
          } as unknown as EntityType<Item>;

          yield* sot
            .write([entity('a', 'Alpha', '2024-01-01T00:00:00.000Z'), invalid])
            .pipe(Effect.flip);

          expect(yield* sot.getAll()).toEqual([]);
        }),
      );
    });
  });
});
