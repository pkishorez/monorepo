import { Effect, Schema } from 'effect';
import type { DecodedEntity } from '../../../../core/index.js';
import { EntityESchema } from '../../../../eschema/index.js';
import { Memory } from '../../../../db/memory/index.js';
import { describe, expect, it } from 'vitest';
import {
  makeSyncStore,
  storedReplicaEntity,
  syncStore,
} from '../../sync-store/index.js';
import { makeSyncReplica } from '../index.js';

type Item = { id: string; name: string };

const schema = EntityESchema.make('Item', 'id', {
  name: Schema.String,
}).build();

const entity = (
  id: string,
  name: string,
  updated: string,
): DecodedEntity<Item> => ({
  value: { id, name },
  meta: { _e: 'Item', _u: updated, _d: false },
});

const entityWithS = (
  id: string,
  name: string,
  updated: string,
  settled: number,
): DecodedEntity<Item> => ({
  value: { id, name },
  meta: {
    _e: 'Item',
    _u: updated,
    _d: false,
    _s: settled,
  },
});

const tombstone = (id: string, updated: string): DecodedEntity<Item> => ({
  value: { id, name: 'Deleted' },
  meta: { _e: 'Item', _u: updated, _d: true },
});

const makeReplica = () => {
  const store = makeSyncStore(Memory.make(syncStore).layer);
  return { store, replica: makeSyncReplica({ schema, store }) };
};

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E>) =>
  it(name, () => Effect.runPromise(fn() as Effect.Effect<A, E, never>));

describe('Sync Replica over StdTable', () => {
  itEffect('stamps and persists one client timestamp for accepted values', () =>
    Effect.gen(function* () {
      const { replica } = makeReplica();
      const before = Date.now();
      const result = yield* replica.applyToSyncReplica([
        entity('a', 'Alpha', '2024-01-01T00:00:00.000Z'),
        entity('b', 'Beta', '2024-01-01T00:00:01.000Z'),
      ]);
      const after = Date.now();

      expect(result).toHaveLength(2);
      expect(result[0]!.meta._c).toBe(result[1]!.meta._c);
      expect(result[0]!.meta._c).toBeGreaterThanOrEqual(before);
      expect(result[0]!.meta._c).toBeLessThanOrEqual(after);
      expect(
        (yield* replica.since(null)).entities.map((i) => i.meta._c),
      ).toEqual([result[0]!.meta._c, result[0]!.meta._c]);
    }),
  );

  itEffect('stores an encoded entity but returns a decoded entity', () =>
    Effect.gen(function* () {
      const { store, replica } = makeReplica();
      const [accepted] = yield* replica.applyToSyncReplica([
        entity('a', 'Alpha', '1'),
      ]);
      const stored = yield* store.provide(
        storedReplicaEntity.get({ collection: 'Item', key: 'a' }),
        {
          collection: 'Item',
          operation: 'get',
          record: 'sync-replica',
        },
      );

      expect(accepted?.value).toEqual({ id: 'a', name: 'Alpha' });
      expect(accepted?.value).not.toHaveProperty('_v');
      expect(stored?.value.entity).toMatchObject({
        value: { _v: 'v1', id: 'a', name: 'Alpha' },
        meta: { _e: 'Item', _u: '1', _d: false },
      });
    }),
  );

  itEffect('keeps the newer remote entity', () =>
    Effect.gen(function* () {
      const { replica } = makeReplica();
      yield* replica.applyToSyncReplica([entity('a', 'Newer', '2')]);
      const result = yield* replica.applyToSyncReplica([
        entity('a', 'Older', '1'),
      ]);

      expect(result).toEqual([]);
      expect((yield* replica.get('a'))?.value.name).toBe('Newer');
    }),
  );

  itEffect(
    'reconciles a server settle marker without replacing stale value',
    () =>
      Effect.gen(function* () {
        const { replica } = makeReplica();
        yield* replica.applyToSyncReplica([entity('a', 'Alpha', '1')]);
        const result = yield* replica.applyToSyncReplica([
          entityWithS('a', 'Ignored', '1', 42),
        ]);

        expect(result).toHaveLength(1);
        expect(result[0]!.value.name).toBe('Alpha');
        expect(result[0]!.meta._s).toBe(42);
      }),
  );

  itEffect(
    'converges concurrent writes through StdTable optimistic updates',
    () =>
      Effect.gen(function* () {
        const { replica } = makeReplica();
        yield* Effect.all(
          [
            replica.applyToSyncReplica([entity('a', 'Older', '1')]),
            replica.applyToSyncReplica([entity('a', 'Newer', '2')]),
          ],
          { concurrency: 'unbounded' },
        );

        expect((yield* replica.get('a'))?.value.name).toBe('Newer');
      }),
  );

  itEffect('allocates projection positions through the durable cursor', () =>
    Effect.gen(function* () {
      const { replica } = makeReplica();
      yield* Effect.all(
        [
          replica.applyToSyncReplica([entity('a', 'Alpha', '1')]),
          replica.applyToSyncReplica([entity('b', 'Beta', '1')]),
        ],
        { concurrency: 'unbounded' },
      );

      const first = yield* replica.since(null);
      expect(first.entities).toHaveLength(2);
      expect(first.position).toBe('00000000000000000000000000000002');

      yield* replica.applyToSyncReplica([entity('c', 'Gamma', '1')]);
      const next = yield* replica.since(first.position);
      expect(next.entities.map((item) => item.value.id)).toEqual(['c']);
      expect(next.position).toBe('00000000000000000000000000000003');
    }),
  );

  itEffect('writes a batch wider than one transaction in sequence order', () =>
    Effect.gen(function* () {
      const { replica } = makeReplica();
      const batch = Array.from({ length: 250 }, (_, index) =>
        entity(`item-${String(index).padStart(3, '0')}`, `Item ${index}`, '1'),
      );
      const accepted = yield* replica.applyToSyncReplica(batch);
      expect(accepted).toHaveLength(250);

      const delta = yield* replica.since(null);
      expect(delta.entities.map((item) => item.value.id)).toEqual(
        batch.map((item) => item.value.id),
      );
      expect(delta.position).toBe('00000000000000000000000000000250');

      const again = yield* replica.applyToSyncReplica([
        ...batch.slice(0, 20),
        entity('item-new', 'New', '1'),
      ]);
      expect(again.map((item) => item.value.id)).toEqual(['item-new']);
      const next = yield* replica.since(delta.position);
      expect(next.entities.map((item) => item.value.id)).toEqual(['item-new']);
      expect(next.position).toBe('00000000000000000000000000000251');
    }),
  );

  itEffect('validates the complete batch before writing any entity', () =>
    Effect.gen(function* () {
      const { replica } = makeReplica();
      const invalid = {
        ...entity('b', 'Beta', '1'),
        meta: { _e: 'Item' },
      } as unknown as DecodedEntity<Item>;

      yield* replica
        .applyToSyncReplica([entity('a', 'Alpha', '1'), invalid])
        .pipe(Effect.flip);
      expect((yield* replica.since(null)).entities).toEqual([]);
    }),
  );

  itEffect('collapses duplicate batch keys to the newest remote version', () =>
    Effect.gen(function* () {
      const { replica } = makeReplica();
      const result = yield* replica.applyToSyncReplica([
        entity('a', 'Older', '1'),
        entity('a', 'Newer', '2'),
      ]);

      expect(result).toHaveLength(1);
      expect((yield* replica.get('a'))?.value.name).toBe('Newer');
    }),
  );

  itEffect('returns complete accepted tombstone entities', () =>
    Effect.gen(function* () {
      const { replica } = makeReplica();
      yield* replica.applyToSyncReplica([entity('a', 'Alpha', '1')]);

      const result = yield* replica.applyToSyncReplica([tombstone('a', '2')]);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        value: { id: 'a', name: 'Deleted' },
        meta: { _e: 'Item', _u: '2', _d: true },
      });
      expect(result[0]!.meta._c).toEqual(expect.any(Number));
    }),
  );

  itEffect('fails a malformed entity instead of dying', () =>
    Effect.gen(function* () {
      const { replica } = makeReplica();

      const result = yield* replica
        .applyToSyncReplica([{ value: { id: 'a', name: 'Alpha' } } as never])
        .pipe(Effect.result);

      expect(result._tag).toBe('Failure');
      expect(result._tag === 'Failure' && result.failure._tag).toBe('Invalid');
    }),
  );
});
