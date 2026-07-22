import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import { SingleEntityESchema } from '../../../eschema/index.js';
import { Effect, Layer, Schema } from 'effect';
import { IdbDB } from '../src/db.js';
import { idbLayer } from '../src/layer.js';
import { IdbTable } from '../src/idb-table.js';

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
  const AppConfig = table
    .singleEntity(configSchema)
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

  describe('getAndUpdate', () => {
    itEffect('plain object patch', () => {
      const { layer, table, AppConfig } = makeConfig();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          yield* AppConfig.put({ theme: 'light', maxRetries: 3 });

          const result = yield* AppConfig.getAndUpdate({ theme: 'dark' });

          expect(result.value.theme).toBe('dark');
          expect(result.value.maxRetries).toBe(3);
        }),
      );
    });

    itEffect('callback derives the partial from the current value', () => {
      const { layer, table, AppConfig } = makeConfig();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          yield* AppConfig.put({ theme: 'light', maxRetries: 3 });

          const result = yield* AppConfig.getAndUpdate((current) => ({
            maxRetries: current.maxRetries + 1,
          }));

          expect(result.value.maxRetries).toBe(4);
        }),
      );
    });

    itEffect('treats the default as current before the first write', () => {
      const { layer, table, AppConfig } = makeConfig();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          const updated = yield* AppConfig.getAndUpdate({ theme: 'dark' });
          const after = yield* AppConfig.get();

          expect(updated.value.theme).toBe('dark');
          expect(updated.value.maxRetries).toBe(3);
          expect(updated.meta._u).not.toBe('');
          expect(after.meta._u).toBe(updated.meta._u);
        }),
      );
    });

    itEffect('callback returning null skips the write', () => {
      const { layer, table, AppConfig } = makeConfig();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          const written = yield* AppConfig.put({
            theme: 'light',
            maxRetries: 3,
          });
          const skipped = yield* AppConfig.getAndUpdate(() => null);

          expect(skipped.meta._u).toBe(written.meta._u);
          expect(skipped.value.theme).toBe('light');
        }),
      );
    });

    it('with retries: 0, rejects one of two updates based on the same _u', async () => {
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
          provided(
            layer,
            AppConfig.getAndUpdate({ theme: 'first' }, { retries: 0 }),
          ),
        ),
        Effect.runPromise(
          provided(
            layer,
            AppConfig.getAndUpdate({ theme: 'second' }, { retries: 0 }),
          ),
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

    it('with default retries, both concurrent updates land', async () => {
      const { layer, table, AppConfig } = makeConfig();
      await Effect.runPromise(
        provided(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            yield* AppConfig.put({ theme: 'light', maxRetries: 0 });
          }),
        ),
      );

      await Promise.all([
        Effect.runPromise(
          provided(
            layer,
            AppConfig.getAndUpdate((current) => ({
              maxRetries: current.maxRetries + 1,
            })),
          ),
        ),
        Effect.runPromise(
          provided(
            layer,
            AppConfig.getAndUpdate((current) => ({
              maxRetries: current.maxRetries + 1,
            })),
          ),
        ),
      ]);

      const after = await Effect.runPromise(provided(layer, AppConfig.get()));
      expect(after.value.maxRetries).toBe(2);
    });
  });

  describe('reset', () => {
    itEffect('writes the default value back', () => {
      const { layer, table, AppConfig } = makeConfig();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          const written = yield* AppConfig.put({
            theme: 'dark',
            maxRetries: 9,
          });

          const reverted = yield* AppConfig.reset();
          const after = yield* AppConfig.get();

          expect(reverted.value.theme).toBe('light');
          expect(reverted.meta._u > written.meta._u).toBe(true);
          expect(after.value.theme).toBe('light');
          expect(after.value.maxRetries).toBe(3);
          expect(after.meta._u).toBe(reverted.meta._u);
        }),
      );
    });
  });
});
