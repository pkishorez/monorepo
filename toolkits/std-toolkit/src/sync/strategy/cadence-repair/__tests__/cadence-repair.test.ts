import { Effect, Fiber, Schedule, Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { it, describe, expect } from 'vitest';
import { ulid } from 'ulidx';
import { uTime, type DecodedEntity } from '../../../../core/index.js';
import type { CollectionItem } from '../../../domain/collection-item/index.js';
import type { WriteError } from '../../../domain/sync-error/index.js';
import {
  runCadenceRepair,
  type CadenceConfig,
  type SyncCollection,
} from '../index.js';

type Item = { id: string; p?: string };

const uAt = (ms: number) => ulid(ms);

const makeEntity = (
  u: string,
  overrides?: { _s?: number; _c?: number; id?: string; p?: string },
): DecodedEntity<Item> => ({
  value: {
    id: overrides?.id ?? u,
    ...(overrides?.p != null ? { p: overrides.p } : {}),
  },
  meta: {
    _e: 'Item',
    _u: u,
    _d: false,
    _s: overrides?._s,
    _c: overrides?._c,
  },
});

// Flat collection-row form of an entity: value fields hoisted, meta under `_meta`.
const toRow = (e: DecodedEntity<Item>): CollectionItem<Item> =>
  ({ ...e.value, _meta: e.meta }) as CollectionItem<Item>;

type SubscribersChangeCb = (args: {
  previousSubscriberCount: number;
  subscriberCount: number;
}) => void;

type FakeCollection = SyncCollection<Item> & {
  emitSubscribersChange: (prev: number, next: number) => void;
  applyWrite: (entities: DecodedEntity<Item>[]) => void;
  subscriberListenerCount: () => number;
  valuesCallCount: () => number;
};

// Holds mutable rows keyed by id and serves them via `values()` — the only read
// surface the repair loop uses. `applyWrite` updates the Sync Replica so a
// repaired suspect actually clears, mirroring real replica convergence.
const makeFakeCollection = (opts: {
  subscriberCount: number;
  entities: DecodedEntity<Item>[];
}): FakeCollection => {
  const rows = new Map<string, CollectionItem<Item>>();
  for (const e of opts.entities) rows.set(e.value.id, toRow(e));
  let valuesCalls = 0;
  const subscribers = new Set<SubscribersChangeCb>();

  const collection: FakeCollection = {
    subscriberCount: opts.subscriberCount,
    on(_event: 'subscribers:change', cb: SubscribersChangeCb) {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    values() {
      valuesCalls++;
      return rows.values();
    },
    emitSubscribersChange(prev, next) {
      collection.subscriberCount = next;
      for (const cb of subscribers) {
        cb({ previousSubscriberCount: prev, subscriberCount: next });
      }
    },
    applyWrite(entities) {
      for (const e of entities) rows.set(e.value.id, toRow(e));
    },
    subscriberListenerCount: () => subscribers.size,
    valuesCallCount: () => valuesCalls,
  };

  return collection;
};

const fetchFor = (results: DecodedEntity<Item>[]) => {
  const anchors: Array<DecodedEntity<Item> | null> = [];
  return {
    anchors,
    fetchFrom: (anchor: DecodedEntity<Item> | null) =>
      Effect.sync(() => {
        anchors.push(anchor);
        return results;
      }),
  };
};

const writeFor = (collection: FakeCollection) => {
  const batches: DecodedEntity<Item>[][] = [];
  return {
    batches,
    applyToSyncReplica: (entities: DecodedEntity<Item>[]) =>
      Effect.sync(() => {
        batches.push(entities);
        collection.applyWrite(entities);
      }),
  };
};

const defaultConfig: CadenceConfig = {
  window: 5_000,
  readiness: 10_000,
  pollDelay: 2_000,
};

const fork = <A, E>(
  effect: Effect.Effect<A, E, Scope.Scope>,
): Effect.Effect<Fiber.Fiber<A, E>, never, Scope.Scope> =>
  Effect.forkScoped(effect, { startImmediately: true });

const runWithTestClock = <A>(
  effect: Effect.Effect<A, WriteError, Scope.Scope>,
  startTime = 0,
): Promise<A> =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* TestClock.setTime(startTime);
      return yield* Effect.scoped(effect);
    }).pipe(Effect.provide(TestClock.layer())) as Effect.Effect<A, WriteError>,
  );

describe('Sync', () => {
  describe('Cadence', () => {
    describe('Run', () => {
      it('repairs a suspect that is already past readiness, passing predecessor as anchor', async () => {
        const nowMs = 100_000;
        const uStr = uAt(nowMs - 20_000);
        // _s - uTime(_u) = 1_000ms < cadence(5_000) → suspect
        const suspect = makeEntity(uStr, { _s: uTime(uStr)! + 1_000 });

        const predecessorU = uAt(nowMs - 30_000);
        const predecessor = makeEntity(predecessorU);

        const fetchResults = [makeEntity(uStr, { _s: nowMs, _c: nowMs })];

        const { anchors, fetchFrom } = fetchFor(fetchResults);
        const collection = makeFakeCollection({
          subscriberCount: 1,
          entities: [suspect, predecessor],
        });
        const { batches, applyToSyncReplica } = writeFor(collection);

        await runWithTestClock(
          Effect.gen(function* () {
            const fiber = yield* fork(
              runCadenceRepair({
                collection,
                fetchFrom,
                applyToSyncReplica,
                config: defaultConfig,
              }),
            );

            yield* Fiber.interrupt(fiber);
          }),
          nowMs,
        );

        expect(anchors).toEqual([predecessor]);
        expect(batches).toEqual([fetchResults]);
      });

      it('does not repair the same unchanged suspect again', async () => {
        const nowMs = 100_000;
        const uStr = uAt(nowMs - 20_000);
        const suspect = makeEntity(uStr, { _s: uTime(uStr)! + 1_000 });
        const { anchors, fetchFrom } = fetchFor([suspect]);
        const collection = makeFakeCollection({
          subscriberCount: 1,
          entities: [suspect],
        });

        await runWithTestClock(
          Effect.gen(function* () {
            const fiber = yield* fork(
              runCadenceRepair({
                collection,
                fetchFrom,
                applyToSyncReplica: writeFor(collection).applyToSyncReplica,
                config: defaultConfig,
              }),
            );

            yield* Effect.yieldNow;
            expect(anchors).toHaveLength(1);
            yield* TestClock.adjust(defaultConfig.pollDelay * 3);
            yield* Effect.yieldNow;
            expect(anchors).toHaveLength(1);
            yield* Fiber.interrupt(fiber);
          }),
          nowMs,
        );
      });

      it('does not repair a suspect not yet past readiness; repairs after clock advances', async () => {
        const baseMs = 0;
        const uStr = uAt(baseMs);
        // _s - uTime(_u) = 1_000ms < cadence → suspect; _u at epoch
        const suspect = makeEntity(uStr, { _s: 1_000 });
        const fetchResults = [makeEntity(uStr, { _s: 15_000, _c: 15_000 })];

        const { anchors, fetchFrom } = fetchFor(fetchResults);
        const collection = makeFakeCollection({
          subscriberCount: 1,
          entities: [suspect],
        });
        const { batches, applyToSyncReplica } = writeFor(collection);

        await runWithTestClock(
          Effect.gen(function* () {
            const fiber = yield* fork(
              runCadenceRepair({
                collection,
                fetchFrom,
                applyToSyncReplica,
                config: { ...defaultConfig, readiness: 10_000 },
              }),
            );

            // At t=0: elapsed = 0 - 0 = 0 < readiness(10_000); loop sleeps
            expect(anchors).toEqual([]);

            // Advance clock past readiness (10_000ms); loop wakes and repairs
            yield* TestClock.adjust(12_000);
            yield* Fiber.interrupt(fiber);
          }),
          baseMs,
        );

        expect(anchors).toHaveLength(1);
        expect(batches).toHaveLength(1);
      });

      it('never treats a record without _s as a suspect', async () => {
        const { anchors, fetchFrom } = fetchFor([]);
        const collection = makeFakeCollection({
          subscriberCount: 1,
          entities: [makeEntity(uAt(100_000))],
        });
        const { batches, applyToSyncReplica } = writeFor(collection);

        await runWithTestClock(
          Effect.gen(function* () {
            const fiber = yield* fork(
              runCadenceRepair({
                collection,
                fetchFrom,
                applyToSyncReplica,
                config: defaultConfig,
              }),
            );

            expect(anchors).toEqual([]);
            expect(batches).toEqual([]);
            yield* Fiber.interrupt(fiber);
          }),
          100_000,
        );
      });

      it('never treats a record with _s − _u >= cadence as a suspect', async () => {
        const { anchors, fetchFrom } = fetchFor([]);
        const uStr = uAt(100_000 - 20_000);
        // _s - _u = 20_000ms >= cadence(5_000) → settled, not a suspect
        const collection = makeFakeCollection({
          subscriberCount: 1,
          entities: [makeEntity(uStr, { _s: uTime(uStr)! + 20_000 })],
        });
        const { applyToSyncReplica } = writeFor(collection);

        await runWithTestClock(
          Effect.gen(function* () {
            const fiber = yield* fork(
              runCadenceRepair({
                collection,
                fetchFrom,
                applyToSyncReplica,
                config: defaultConfig,
              }),
            );

            expect(anchors).toEqual([]);
            yield* Fiber.interrupt(fiber);
          }),
          100_000,
        );
      });

      it('applies clock skew: _c − _s = 30_000 delays readiness by 30_000ms', async () => {
        const baseMs = 0;
        const uStr = uAt(baseMs);
        // _s - _u = 1_000ms < cadence → suspect; _c - _s = 30_000ms skew
        const suspect = makeEntity(uStr, { _s: 1_000, _c: 31_000 });
        const fetchResults = [makeEntity(uStr, { _s: 50_000, _c: 80_000 })];

        const { anchors, fetchFrom } = fetchFor(fetchResults);
        const collection = makeFakeCollection({
          subscriberCount: 1,
          entities: [suspect],
        });
        const { batches, applyToSyncReplica } = writeFor(collection);

        await runWithTestClock(
          Effect.gen(function* () {
            const fiber = yield* fork(
              runCadenceRepair({
                collection,
                fetchFrom,
                applyToSyncReplica,
                config: { ...defaultConfig, readiness: 10_000 },
              }),
            );

            // Without skew: ready at t=10_000; with skew (_c-_s=30_000): ready at t=40_000
            yield* TestClock.adjust(15_000);
            // Still sleeping (readiness not met with skew correction)
            expect(anchors).toEqual([]);

            // Advance past 40_000ms total
            yield* TestClock.adjust(30_000);
            yield* Fiber.interrupt(fiber);
          }),
          baseMs,
        );

        expect(anchors).toHaveLength(1);
        expect(batches).toHaveLength(1);
      });

      it('does not scan when subscriberCount is 0, resumes when opened', async () => {
        const nowMs = 100_000;
        const uStr = uAt(nowMs - 20_000);
        const suspect = makeEntity(uStr, { _s: uTime(uStr)! + 1_000 });
        const fetchResults = [makeEntity(uStr, { _s: nowMs })];

        const { anchors, fetchFrom } = fetchFor(fetchResults);
        const collection = makeFakeCollection({
          subscriberCount: 0,
          entities: [suspect],
        });
        const { applyToSyncReplica } = writeFor(collection);

        await runWithTestClock(
          Effect.gen(function* () {
            const fiber = yield* fork(
              runCadenceRepair({
                collection,
                fetchFrom,
                applyToSyncReplica,
                config: defaultConfig,
              }),
            );

            // Latch closed (0 subscribers); loop parked — no scans
            expect(collection.valuesCallCount()).toBe(0);
            expect(anchors).toEqual([]);

            // Open latch
            collection.emitSubscribersChange(0, 1);
            yield* Fiber.interrupt(fiber);
          }),
          nowMs,
        );

        expect(collection.valuesCallCount()).toBeGreaterThan(0);
        expect(anchors).toHaveLength(1);
      });

      it('uses a null anchor when the suspect has no predecessor', async () => {
        const nowMs = 100_000;
        const uStr = uAt(nowMs - 20_000);
        const suspect = makeEntity(uStr, { _s: uTime(uStr)! + 1_000 });
        const fetchResults = [makeEntity(uStr, { _s: nowMs })];

        const { anchors, fetchFrom } = fetchFor(fetchResults);
        const collection = makeFakeCollection({
          subscriberCount: 1,
          entities: [suspect],
        });
        const { applyToSyncReplica } = writeFor(collection);

        await runWithTestClock(
          Effect.gen(function* () {
            const fiber = yield* fork(
              runCadenceRepair({
                collection,
                fetchFrom,
                applyToSyncReplica,
                config: defaultConfig,
              }),
            );

            yield* Fiber.interrupt(fiber);
          }),
          nowMs,
        );

        expect(anchors).toEqual([null]);
      });

      it('releases the subscriber listener before retrying a failed attempt', async () => {
        const nowMs = 100_000;
        const uStr = uAt(nowMs - 20_000);
        const suspect = makeEntity(uStr, { _s: uTime(uStr)! + 1_000 });
        const fetchResults = [makeEntity(uStr, { _s: nowMs })];

        const { fetchFrom } = fetchFor(fetchResults);
        const collection = makeFakeCollection({
          subscriberCount: 1,
          entities: [suspect],
        });

        let attempts = 0;
        const applyToSyncReplica = (entities: DecodedEntity<Item>[]) => {
          attempts += 1;
          if (attempts === 1) {
            return Effect.fail({
              _tag: 'Invalid',
              reason: 'transient write failure',
            } as WriteError);
          }
          return Effect.sync(() => collection.applyWrite(entities));
        };

        await runWithTestClock(
          Effect.gen(function* () {
            const fiber = yield* fork(
              runCadenceRepair({
                collection,
                fetchFrom,
                applyToSyncReplica,
                config: defaultConfig,
              }).pipe(Effect.retry(Schedule.recurs(1))),
            );

            for (let i = 0; i < 5; i++) yield* Effect.yieldNow;

            expect(attempts).toBe(2);
            expect(collection.subscriberListenerCount()).toBe(1);

            yield* Fiber.interrupt(fiber);
          }),
          nowMs,
        );
      });

      it('supports ISO-timestamp _u values for non-ULID backends', async () => {
        const nowMs = 100_000;
        const uStr = new Date(nowMs - 20_000).toISOString();
        const suspect = makeEntity(uStr, { _s: Date.parse(uStr) + 1_000 });
        const fetchResults = [makeEntity(uStr, { _s: nowMs, _c: nowMs })];

        const { anchors, fetchFrom } = fetchFor(fetchResults);
        const collection = makeFakeCollection({
          subscriberCount: 1,
          entities: [suspect],
        });
        const { batches, applyToSyncReplica } = writeFor(collection);

        await runWithTestClock(
          Effect.gen(function* () {
            const fiber = yield* fork(
              runCadenceRepair({
                collection,
                fetchFrom,
                applyToSyncReplica,
                config: defaultConfig,
              }),
            );

            yield* Fiber.interrupt(fiber);
          }),
          nowMs,
        );

        expect(anchors).toHaveLength(1);
        expect(batches).toHaveLength(1);
      });

      it('fails with a WriteError when _u is neither a ULID nor an ISO timestamp', async () => {
        const nowMs = 100_000;
        const suspect = makeEntity('not-a-valid-u', { _s: nowMs });

        const { anchors, fetchFrom } = fetchFor([]);
        const collection = makeFakeCollection({
          subscriberCount: 1,
          entities: [suspect],
        });
        const { applyToSyncReplica } = writeFor(collection);

        const exit = await runWithTestClock(
          Effect.gen(function* () {
            const fiber = yield* fork(
              runCadenceRepair({
                collection,
                fetchFrom,
                applyToSyncReplica,
                config: defaultConfig,
              }),
            );

            return yield* Fiber.await(fiber);
          }),
          nowMs,
        );

        expect(exit._tag).toBe('Failure');
        expect(anchors).toEqual([]);
      });

      it('anchors on the same-partition predecessor and ignores other partitions', async () => {
        const nowMs = 100_000;
        const suspectU = uAt(nowMs - 20_000);
        const predecessorU = uAt(nowMs - 30_000);
        const otherU = uAt(nowMs - 25_000);

        const suspect = makeEntity(suspectU, {
          id: 'a-suspect',
          p: 'A',
          _s: uTime(suspectU)! + 1_000,
        });
        const samePartitionPredecessor = makeEntity(predecessorU, {
          id: 'a-pred',
          p: 'A',
        });
        // Closer in `_u` but in another partition → must be ignored as the anchor.
        const otherPartition = makeEntity(otherU, { id: 'b-pred', p: 'B' });

        const fetchResults = [
          makeEntity(suspectU, { id: 'a-suspect', p: 'A', _s: nowMs }),
        ];
        const { anchors, fetchFrom } = fetchFor(fetchResults);
        const collection = makeFakeCollection({
          subscriberCount: 1,
          entities: [suspect, samePartitionPredecessor, otherPartition],
        });
        const { batches, applyToSyncReplica } = writeFor(collection);

        await runWithTestClock(
          Effect.gen(function* () {
            const fiber = yield* fork(
              runCadenceRepair({
                collection,
                fetchFrom,
                applyToSyncReplica,
                partition: { field: 'p', value: 'A' },
                config: defaultConfig,
              }),
            );

            yield* Fiber.interrupt(fiber);
          }),
          nowMs,
        );

        expect(anchors).toEqual([samePartitionPredecessor]);
        expect(batches).toHaveLength(1);
      });
    });
  });
});
