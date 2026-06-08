import Database from 'better-sqlite3';
import { Effect, Layer, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';
import { SQLiteTable, SQLiteEntity, type SqliteDB } from '@std-toolkit/sqlite';
import { SqliteDBBetterSqlite3 } from '@std-toolkit/sqlite/adapters/better-sqlite3';
import { vdescribe, vtest } from '@monorepo/vtest';

const UserSchema = EntityESchema.make('User', 'userId', {
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
  'delete is a soft delete',
  'the row stays, marked _d: true, so sync sees deletion as a change',
  () => {
    vtest(
      'delete flips _d and the record is still readable',
      'deletion is an event, not a gap — get still finds the row',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* users.insert({ userId: 'u1', name: 'Ada' });
            const deleted = yield* users.delete({ userId: 'u1' });
            if (deleted.meta._d !== true) throw new Error('expected _d true');

            const after = yield* users.get({ userId: 'u1' });
            if (after === null) throw new Error('soft delete keeps the row');
            if (after.meta._d !== true)
              throw new Error('expected marked deleted');
          }),
        ),
    );

    vtest(
      'deleting a missing record fails',
      'there is nothing to mark, so delete reports DeleteFailed',
      () =>
        withDb(
          Effect.gen(function* () {
            const err = yield* users
              .delete({ userId: 'ghost' })
              .pipe(Effect.flip);
            if (err.error._tag !== 'DeleteFailed') {
              throw new Error('expected DeleteFailed');
            }
          }),
        ),
    );
  },
);
