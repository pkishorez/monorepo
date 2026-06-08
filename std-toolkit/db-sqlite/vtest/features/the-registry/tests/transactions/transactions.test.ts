import Database from 'better-sqlite3';
import { Effect, Layer, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';
import {
  SQLiteTable,
  SQLiteEntity,
  EntityRegistry,
  type SqliteDB,
} from '@std-toolkit/sqlite';
import { SqliteDBBetterSqlite3 } from '@std-toolkit/sqlite/adapters/better-sqlite3';
import { vdescribe, vtest } from '@monorepo/vtest';

const CounterSchema = EntityESchema.make('Counter', 'counterId', {
  count: Schema.Number,
}).build();

const table = SQLiteTable.make({ tableName: 'std_data' })
  .primary('pk', 'sk')
  .build();
const counters = SQLiteEntity.make(table)
  .eschema(CounterSchema)
  .primary()
  .build();
const registry = EntityRegistry.make(table).register(counters).build();

const withDb = <A>(body: Effect.Effect<A, unknown, SqliteDB>): Promise<A> => {
  const layer: Layer.Layer<SqliteDB> = SqliteDBBetterSqlite3(
    new Database(':memory:'),
  );
  return Effect.runPromise(
    Effect.gen(function* () {
      yield* registry.setup();
      return yield* body;
    }).pipe(Effect.provide(layer)),
  );
};

vdescribe(
  'a transaction is all-or-nothing across entities',
  'commit on success; roll back every write on any failure',
  () => {
    vtest(
      'a successful transaction commits all writes',
      'multiple inserts land together when the effect succeeds',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* registry.transaction(
              Effect.gen(function* () {
                yield* counters.insert({ counterId: 'a', count: 1 });
                yield* counters.insert({ counterId: 'b', count: 2 });
              }),
            );
            const a = yield* counters.get({ counterId: 'a' });
            const b = yield* counters.get({ counterId: 'b' });
            if (a === null || b === null) throw new Error('both should commit');
          }),
        ),
    );

    vtest(
      'a failing transaction rolls every write back',
      'a failure mid-transaction leaves the table as it was',
      () =>
        withDb(
          Effect.gen(function* () {
            const exit = yield* registry
              .transaction(
                Effect.gen(function* () {
                  yield* counters.insert({ counterId: 'x', count: 1 });
                  return yield* Effect.fail(new Error('boom'));
                }),
              )
              .pipe(Effect.result);
            if (exit._tag !== 'Failure') throw new Error('expected failure');

            const x = yield* counters.get({ counterId: 'x' });
            if (x !== null) throw new Error('insert should have rolled back');
          }),
        ),
    );
  },
);
