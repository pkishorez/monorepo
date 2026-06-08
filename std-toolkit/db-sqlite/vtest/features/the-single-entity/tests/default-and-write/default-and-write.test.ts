import Database from 'better-sqlite3';
import { Effect, Layer, Schema } from 'effect';
import { SingleEntityESchema } from '@std-toolkit/eschema';
import {
  SQLiteTable,
  SQLiteSingleEntity,
  type SqliteDB,
} from '@std-toolkit/sqlite';
import { SqliteDBBetterSqlite3 } from '@std-toolkit/sqlite/adapters/better-sqlite3';
import { vdescribe, vtest } from '@monorepo/vtest';

const configSchema = SingleEntityESchema.make('AppConfig', {
  theme: Schema.String,
  maxRetries: Schema.Number,
}).build();

const table = SQLiteTable.make({ tableName: 'std_data' })
  .primary('pk', 'sk')
  .build();

const AppConfig = SQLiteSingleEntity.make(table)
  .eschema(configSchema)
  .default({ theme: 'light', maxRetries: 3 });

const withDb = <A>(body: Effect.Effect<A, unknown, SqliteDB>): Promise<A> => {
  const layer: Layer.Layer<SqliteDB> = SqliteDBBetterSqlite3(
    new Database(':memory:'),
  );
  return Effect.runPromise(
    Effect.gen(function* () {
      yield* table.setup();
      return yield* body;
    }).pipe(Effect.provide(layer)),
  );
};

vdescribe(
  'a single entity is one record with a default',
  'get never returns null; put upserts; update needs an existing record',
  () => {
    vtest(
      'get returns the default before anything is written',
      'an empty _u marks the synthetic default — never null',
      () =>
        withDb(
          Effect.gen(function* () {
            const result = yield* AppConfig.get();
            if (result.value.theme !== 'light')
              throw new Error('expected default');
            if (result.meta._u !== '') throw new Error('default has empty _u');
          }),
        ),
    );

    vtest(
      'put writes unconditionally and get reflects it',
      'put is an upsert: the slot holds whatever you last wrote',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* AppConfig.put({ theme: 'dark', maxRetries: 5 });
            const result = yield* AppConfig.get();
            if (result.value.theme !== 'dark') throw new Error('expected dark');
            if (result.meta._u === '')
              throw new Error('written record has a real _u');
          }),
        ),
    );

    vtest(
      'update patches an existing record but fails when none exists',
      'with no prior write there is nothing to merge onto',
      () =>
        withDb(
          Effect.gen(function* () {
            const err = yield* AppConfig.update({
              update: { theme: 'dark' },
            }).pipe(Effect.flip);
            if (err.error._tag !== 'UpdateFailed') {
              throw new Error('expected UpdateFailed');
            }

            yield* AppConfig.put({ theme: 'light', maxRetries: 3 });
            const patched = yield* AppConfig.update({
              update: { theme: 'blue' },
            });
            if (patched.value.theme !== 'blue')
              throw new Error('expected blue');
            if (patched.value.maxRetries !== 3)
              throw new Error('expected merge');
          }),
        ),
    );
  },
);
