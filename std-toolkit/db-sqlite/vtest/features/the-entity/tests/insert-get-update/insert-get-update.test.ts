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
  .build();

const users = SQLiteEntity.make(table).eschema(UserSchema).primary().build();

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
  'an entity wraps your value in a versioned envelope',
  'insert validates and keys it; get reads it back; update patches it',
  () => {
    vtest(
      'insert returns the value plus a meta envelope',
      'you hand a plain value; the entity stamps _e / _v / _u / _d',
      () =>
        withDb(
          Effect.gen(function* () {
            const written = yield* users.insert({
              userId: 'u1',
              email: 'ada@example.com',
              name: 'Ada',
            });
            if (written.meta._e !== 'User') throw new Error('expected _e User');
            if (written.meta._d !== false)
              throw new Error('expected not deleted');
            if (!written.meta._u) throw new Error('expected an update key');
          }),
        ),
    );

    vtest(
      'get returns the stored value, and null for a miss',
      'a missing record is null, never a thrown error',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* users.insert({
              userId: 'u1',
              email: 'ada@example.com',
              name: 'Ada',
            });
            const hit = yield* users.get({ userId: 'u1' });
            if (hit === null || hit.value.name !== 'Ada') {
              throw new Error('expected Ada');
            }
            const miss = yield* users.get({ userId: 'nope' });
            if (miss !== null) throw new Error('expected null for a miss');
          }),
        ),
    );

    vtest(
      'update merges a partial onto the existing record',
      'unspecified fields are preserved; only the patch changes',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* users.insert({
              userId: 'u1',
              email: 'ada@example.com',
              name: 'Ada',
            });
            const updated = yield* users.update(
              { userId: 'u1' },
              { name: 'Ada Lovelace' },
            );
            if (updated.value.name !== 'Ada Lovelace') {
              throw new Error('expected updated name');
            }
            if (updated.value.email !== 'ada@example.com') {
              throw new Error('expected email preserved');
            }
          }),
        ),
    );
  },
);
