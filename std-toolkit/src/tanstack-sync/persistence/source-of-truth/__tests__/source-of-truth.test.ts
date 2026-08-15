import { Effect, Schema } from 'effect';
import type { EntityType } from '../../../../core/index.js';
import { EntityESchema } from '../../../../eschema/index.js';
import { Memory } from '../../../../db/memory/index.js';
import { describe, expect, it } from 'vitest';
import {
  makeSyncPersistence,
  syncPersistenceTable,
} from '../../sync-persistence-table/index.js';
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

const entityWithS = (
  id: string,
  name: string,
  updated: string,
  settled: number,
): EntityType<Item> => ({
  value: { id, name },
  meta: {
    _e: 'Item',
    _v: 'v1',
    _u: updated,
    _d: false,
    _s: settled,
  },
});

const makeSot = () => {
  const persistence = makeSyncPersistence(
    Memory.make(syncPersistenceTable).layer,
  );
  return { persistence, sot: makeSourceOfTruth<Item>({ schema, persistence }) };
};

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E>) =>
  it(name, () => Effect.runPromise(fn() as Effect.Effect<A, E, never>));

describe('Source of Truth over StdTable', () => {
  itEffect('stamps and persists one client timestamp for accepted values', () =>
    Effect.gen(function* () {
      const { sot } = makeSot();
      const before = Date.now();
      const result = yield* sot.write([
        entity('a', 'Alpha', '2024-01-01T00:00:00.000Z'),
        entity('b', 'Beta', '2024-01-01T00:00:01.000Z'),
      ]);
      const after = Date.now();

      expect(result.upserts).toHaveLength(2);
      expect(result.upserts[0]!.meta._c).toBe(result.upserts[1]!.meta._c);
      expect(result.upserts[0]!.meta._c).toBeGreaterThanOrEqual(before);
      expect(result.upserts[0]!.meta._c).toBeLessThanOrEqual(after);
      expect((yield* sot.getAll()).map((item) => item.meta._c)).toEqual([
        result.upserts[0]!.meta._c,
        result.upserts[0]!.meta._c,
      ]);
    }),
  );

  itEffect('keeps the newer remote entity', () =>
    Effect.gen(function* () {
      const { sot } = makeSot();
      yield* sot.write([entity('a', 'Newer', '2')]);
      const result = yield* sot.write([entity('a', 'Older', '1')]);

      expect(result.upserts).toEqual([]);
      expect((yield* sot.get('a'))?.value.name).toBe('Newer');
    }),
  );

  itEffect(
    'reconciles a server settle marker without replacing stale value',
    () =>
      Effect.gen(function* () {
        const { sot } = makeSot();
        yield* sot.write([entity('a', 'Alpha', '1')]);
        const result = yield* sot.write([entityWithS('a', 'Ignored', '1', 42)]);

        expect(result.upserts).toHaveLength(1);
        expect(result.upserts[0]!.value.name).toBe('Alpha');
        expect(result.upserts[0]!.meta._s).toBe(42);
      }),
  );

  itEffect(
    'converges concurrent writes through StdTable optimistic updates',
    () =>
      Effect.gen(function* () {
        const { sot } = makeSot();
        yield* Effect.all(
          [
            sot.write([entity('a', 'Older', '1')]),
            sot.write([entity('a', 'Newer', '2')]),
          ],
          { concurrency: 'unbounded' },
        );

        expect((yield* sot.get('a'))?.value.name).toBe('Newer');
      }),
  );

  itEffect('validates the complete batch before writing any entity', () =>
    Effect.gen(function* () {
      const { sot } = makeSot();
      const invalid = {
        ...entity('b', 'Beta', '1'),
        meta: { _e: 'Item' },
      } as unknown as EntityType<Item>;

      yield* sot.write([entity('a', 'Alpha', '1'), invalid]).pipe(Effect.flip);
      expect(yield* sot.getAll()).toEqual([]);
    }),
  );

  itEffect('collapses duplicate batch keys to the newest remote version', () =>
    Effect.gen(function* () {
      const { sot } = makeSot();
      const result = yield* sot.write([
        entity('a', 'Older', '1'),
        entity('a', 'Newer', '2'),
      ]);

      expect(result.upserts).toHaveLength(1);
      expect((yield* sot.get('a'))?.value.name).toBe('Newer');
    }),
  );
});
