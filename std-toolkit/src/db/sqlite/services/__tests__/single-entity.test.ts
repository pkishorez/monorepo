import { DatabaseSync } from 'node:sqlite';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import {
  SingleEntityESchema,
  EntityESchema,
} from '../../../../eschema/index.js';
import { Effect, type Layer, Schema } from 'effect';
import { nodeSqliteLayer } from '../../sql/adapters/node.js';
import type { SqliteDB } from '../../sql/db.js';
import { SQLiteTable } from '../sqlite-table.js';

// ─── Test Schemas ────────────────────────────────────────────────────────────

const configSchema = SingleEntityESchema.make('AppConfig', {
  theme: Schema.String,
  maxRetries: Schema.Number,
}).build();

// ─── Setup ──────────────────────────────────────────────────────────────────

describe('SQLiteSingleEntity', () => {
  let db: DatabaseSync;
  let layer: Layer.Layer<SqliteDB>;

  const table = SQLiteTable.make().primary('pk', 'sk').build();

  const AppConfig = table
    .singleEntity(configSchema)
    .default({ theme: 'light', maxRetries: 3 });

  beforeAll(async () => {
    db = new DatabaseSync(':memory:');
    layer = nodeSqliteLayer(db, 'std_data');
    await Effect.runPromise(table.setup().pipe(Effect.provide(layer)));
  });

  afterAll(() => {
    db.close();
  });

  // ─── get ─────────────────────────────────────────────────────────────────

  describe('get', () => {
    itEffect('returns default when absent', () =>
      Effect.gen(function* () {
        const result = yield* AppConfig.get();

        expect(result.value.theme).toBe('light');
        expect(result.value.maxRetries).toBe(3);
        expect(result.meta._u).toBe('');
        expect(result.meta._e).toBe('AppConfig');
      }).pipe(Effect.provide(layer)),
    );

    itEffect('returns stored item after put', () =>
      Effect.gen(function* () {
        yield* AppConfig.put({ theme: 'dark', maxRetries: 5 });

        const result = yield* AppConfig.get();

        expect(result.value.theme).toBe('dark');
        expect(result.value.maxRetries).toBe(5);
        expect(result.meta._u).not.toBe('');
        expect(result.meta._e).toBe('AppConfig');
      }).pipe(Effect.provide(layer)),
    );
  });

  // ─── put ─────────────────────────────────────────────────────────────────

  describe('put', () => {
    itEffect('writes unconditionally', () =>
      Effect.gen(function* () {
        const result = yield* AppConfig.put({ theme: 'blue', maxRetries: 10 });

        expect(result.value.theme).toBe('blue');
        expect(result.value.maxRetries).toBe(10);
        expect(result.meta._u).not.toBe('');
      }).pipe(Effect.provide(layer)),
    );

    itEffect('overwrites existing', () =>
      Effect.gen(function* () {
        yield* AppConfig.put({ theme: 'red', maxRetries: 1 });
        yield* AppConfig.put({ theme: 'green', maxRetries: 99 });

        const result = yield* AppConfig.get();

        expect(result.value.theme).toBe('green');
        expect(result.value.maxRetries).toBe(99);
      }).pipe(Effect.provide(layer)),
    );
  });

  // ─── getAndUpdate ────────────────────────────────────────────────────────

  describe('getAndUpdate', () => {
    itEffect('plain object patch', () =>
      Effect.gen(function* () {
        yield* AppConfig.put({ theme: 'light', maxRetries: 3 });

        const result = yield* AppConfig.getAndUpdate({ theme: 'dark' });

        expect(result.value.theme).toBe('dark');
        expect(result.value.maxRetries).toBe(3);
      }).pipe(Effect.provide(layer)),
    );

    itEffect('callback derives the partial from the current value', () =>
      Effect.gen(function* () {
        yield* AppConfig.put({ theme: 'light', maxRetries: 3 });

        const result = yield* AppConfig.getAndUpdate((current) => ({
          maxRetries: current.maxRetries + 1,
        }));

        expect(result.value.maxRetries).toBe(4);
      }).pipe(Effect.provide(layer)),
    );

    itEffect('callback returning null skips the write', () =>
      Effect.gen(function* () {
        const written = yield* AppConfig.put({ theme: 'light', maxRetries: 3 });

        const skipped = yield* AppConfig.getAndUpdate(() => null);

        expect(skipped.meta._u).toBe(written.meta._u);
        expect(skipped.value.theme).toBe('light');
      }).pipe(Effect.provide(layer)),
    );

    itEffect('treats the default as current before the first write', () =>
      Effect.gen(function* () {
        const emptySchema = SingleEntityESchema.make('EmptyConfig', {
          value: Schema.String,
        }).build();

        const emptyTable = SQLiteTable.make().primary('pk', 'sk').build();

        yield* emptyTable.setup();

        const EmptyConfig = emptyTable
          .singleEntity(emptySchema)
          .default({ value: 'x' });

        const updated = yield* EmptyConfig.getAndUpdate((current) => ({
          value: `${current.value}y`,
        }));
        const after = yield* EmptyConfig.get();

        expect(updated.value.value).toBe('xy');
        expect(updated.meta._u).not.toBe('');
        expect(after.value.value).toBe('xy');
        expect(after.meta._u).toBe(updated.meta._u);
      }).pipe(Effect.provide(layer)),
    );

    itEffect('preserves a non-conflict initial insert failure', () => {
      const triggerName = 'fail_insert_failure_config';
      let updateCalls = 0;

      return Effect.gen(function* () {
        const failureSchema = SingleEntityESchema.make('InsertFailureConfig', {
          value: Schema.String,
        }).build();
        const failureTable = SQLiteTable.make().primary('pk', 'sk').build();
        const FailureConfig = failureTable
          .singleEntity(failureSchema)
          .default({ value: 'default' });

        yield* failureTable.setup();
        yield* Effect.sync(() =>
          db.exec(
            `CREATE TRIGGER ${triggerName} BEFORE INSERT ON std_data WHEN NEW.pk = 'InsertFailureConfig' BEGIN SELECT RAISE(FAIL, 'simulated insert failure'); END`,
          ),
        );

        const error = yield* FailureConfig.getAndUpdate(() => {
          updateCalls += 1;
          return { value: 'updated' };
        }).pipe(Effect.flip);

        expect(error.error._tag).toBe('InsertFailed');
        expect(updateCalls).toBe(1);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => db.exec(`DROP TRIGGER IF EXISTS ${triggerName}`)),
        ),
        Effect.provide(layer),
      );
    });
  });

  // ─── reset ───────────────────────────────────────────────────────────────

  describe('reset', () => {
    itEffect('writes the default value back', () =>
      Effect.gen(function* () {
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
      }).pipe(Effect.provide(layer)),
    );
  });

  // ─── registration ────────────────────────────────────────────────────────

  describe('registration', () => {
    it('keyed and single entities share the table namespace', () => {
      const UserSchema = EntityESchema.make('User', 'userId', {
        name: Schema.String,
      }).build();

      const userEntity = table.entity(UserSchema).primary().build();
      expect(userEntity.name).toBe('User');
      expect(AppConfig.name).toBe('AppConfig');
    });

    it('rejects duplicate single entity names on the same table', () => {
      expect(() =>
        table.singleEntity(configSchema).default({
          theme: 'light',
          maxRetries: 3,
        }),
      ).toThrow('Entity "AppConfig" is already defined on this table');
    });
  });
});
