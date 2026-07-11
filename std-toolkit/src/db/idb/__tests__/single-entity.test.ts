import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import { SingleEntityESchema } from '../../../eschema/index.js';
import { Effect, Layer, Schema } from 'effect';
import { IdbDB } from '../db.js';
import { idbLayer } from '../layer.js';
import { IdbTable } from '../idb-table.js';
import { IdbSingleEntity } from '../idb-single-entity.js';

// ─── Test Schemas ────────────────────────────────────────────────────────────

const configSchema = SingleEntityESchema.make('AppConfig', {
  theme: Schema.String,
  maxRetries: Schema.Number,
}).build();

let dbCounter = 0;
const uniqueDbName = () => `idb-single-entity-test-${++dbCounter}`;

const provided = <A, E>(
  layer: Layer.Layer<IdbDB>,
  effect: Effect.Effect<A, E, IdbDB>,
) => effect.pipe(Effect.provide(layer));

const makeConfig = () => {
  const layer = idbLayer(uniqueDbName(), 'std_data');
  const table = IdbTable.make().primary('pk', 'sk').build();
  const AppConfig = IdbSingleEntity.make(table)
    .eschema(configSchema)
    .default({ theme: 'light', maxRetries: 3 });
  return { layer, table, AppConfig };
};

describe('IdbSingleEntity', () => {
  describe('get', () => {
    itEffect('returns default when absent', () => {
      const { layer, table, AppConfig } = makeConfig();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          const result = yield* AppConfig.get();

          expect(result.value.theme).toBe('light');
          expect(result.value.maxRetries).toBe(3);
          expect(result.meta._u).toBe('');
          expect(result.meta._e).toBe('AppConfig');
        }),
      );
    });

    itEffect('returns stored item after put', () => {
      const { layer, table, AppConfig } = makeConfig();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          yield* AppConfig.put({ theme: 'dark', maxRetries: 5 });

          const result = yield* AppConfig.get();

          expect(result.value.theme).toBe('dark');
          expect(result.value.maxRetries).toBe(5);
          expect(result.meta._u).not.toBe('');
          expect(result.meta._e).toBe('AppConfig');
        }),
      );
    });
  });

  describe('put', () => {
    itEffect('writes unconditionally', () => {
      const { layer, table, AppConfig } = makeConfig();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          const result = yield* AppConfig.put({
            theme: 'blue',
            maxRetries: 10,
          });

          expect(result.value.theme).toBe('blue');
          expect(result.value.maxRetries).toBe(10);
          expect(result.meta._u).not.toBe('');
        }),
      );
    });

    itEffect('overwrites existing', () => {
      const { layer, table, AppConfig } = makeConfig();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          yield* AppConfig.put({ theme: 'red', maxRetries: 1 });
          yield* AppConfig.put({ theme: 'green', maxRetries: 99 });

          const result = yield* AppConfig.get();

          expect(result.value.theme).toBe('green');
          expect(result.value.maxRetries).toBe(99);
        }),
      );
    });
  });

  describe('update', () => {
    itEffect('plain object patch', () => {
      const { layer, table, AppConfig } = makeConfig();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          yield* AppConfig.put({ theme: 'light', maxRetries: 3 });

          const result = yield* AppConfig.update({ update: { theme: 'dark' } });

          expect(result.value.theme).toBe('dark');
          expect(result.value.maxRetries).toBe(3);
        }),
      );
    });

    itEffect('fails with noItemToUpdate on non-existent item', () => {
      const { layer, table, AppConfig } = makeConfig();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          const error = yield* AppConfig.update({
            update: { theme: 'dark' },
          }).pipe(Effect.flip);

          expect(error.code).toBe('noItemToUpdate');
        }),
      );
    });

    it('rejects one of two updates based on the same _u', async () => {
      const { layer, table, AppConfig } = makeConfig();
      await Effect.runPromise(
        provided(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            yield* AppConfig.put({ theme: 'light', maxRetries: 3 });
          }),
        ),
      );

      const results = await Promise.allSettled([
        Effect.runPromise(
          provided(layer, AppConfig.update({ update: { theme: 'first' } })),
        ),
        Effect.runPromise(
          provided(layer, AppConfig.update({ update: { theme: 'second' } })),
        ),
      ]);

      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = results.find((result) => result.status === 'rejected');
      expect(rejected).toMatchObject({
        reason: { code: 'conditionFailed' },
      });
    });
  });
});
