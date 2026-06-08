import Database from 'better-sqlite3';
import { Effect, Layer, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';
import { SQLiteTable, SQLiteEntity, type SqliteDB } from '@std-toolkit/sqlite';
import { SqliteDBBetterSqlite3 } from '@std-toolkit/sqlite/adapters/better-sqlite3';
import { vdescribe, vtest } from '@monorepo/vtest';

const UserSchema = EntityESchema.make('User', 'userId', {
  email: Schema.String,
  name: Schema.String,
}).build();

const table = SQLiteTable.make({ tableName: 'std_data' })
  .primary('pk', 'sk')
  .index('IDX1', 'IDX1PK', 'IDX1SK')
  .build();

const users = SQLiteEntity.make(table)
  .eschema(UserSchema)
  .primary()
  .index('IDX1', 'byEmail', { pk: ['email'] })
  .build();

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
  'a secondary index is a declared, alternate access pattern',
  'query by email instead of id; update keeps the index in sync',
  () => {
    vtest(
      'records are reachable through the secondary index',
      'byEmail partitions users by their email field',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* users.insert({
              userId: 'u1',
              email: 'ada@example.com',
              name: 'Ada',
            });
            const result = yield* users.query('byEmail', {
              pk: { email: 'ada@example.com' },
              sk: { '>=': null },
            });
            if (result.items.length !== 1) throw new Error('expected one hit');
            if (result.items[0]!.value.name !== 'Ada') {
              throw new Error('expected Ada by email');
            }
          }),
        ),
    );

    vtest(
      'updating the indexed field moves the record across partitions',
      'no manual index upkeep: the old email empties, the new one fills',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* users.insert({
              userId: 'u1',
              email: 'old@example.com',
              name: 'Ada',
            });
            yield* users.update({ userId: 'u1' }, { email: 'new@example.com' });

            const old = yield* users.query('byEmail', {
              pk: { email: 'old@example.com' },
              sk: { '>=': null },
            });
            if (old.items.length !== 0)
              throw new Error('old partition should empty');

            const fresh = yield* users.query('byEmail', {
              pk: { email: 'new@example.com' },
              sk: { '>=': null },
            });
            if (fresh.items.length !== 1)
              throw new Error('new partition should fill');
          }),
        ),
    );
  },
);
