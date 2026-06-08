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

const UserSchema = EntityESchema.make('User', 'userId', {
  name: Schema.String,
}).build();
const PostSchema = EntityESchema.make('Post', 'postId', {
  authorId: Schema.String,
  title: Schema.String,
}).build();

const table = SQLiteTable.make({ tableName: 'std_data' })
  .primary('pk', 'sk')
  .build();

const userEntity = SQLiteEntity.make(table)
  .eschema(UserSchema)
  .primary()
  .build();
const postEntity = SQLiteEntity.make(table)
  .eschema(PostSchema)
  .primary({ pk: ['authorId'] })
  .build();

const registry = EntityRegistry.make(table)
  .register(userEntity)
  .register(postEntity)
  .build();

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
  'one registry gathers many entities on one table',
  'setup once, look entities up by name, and they never collide',
  () => {
    vtest(
      'entity(name) returns the registered instance and lists names',
      'the registry is the typed directory of your entities',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* Effect.void;
            if (registry.entity('User') !== userEntity) {
              throw new Error('expected the User entity');
            }
            const names = registry.entityNames;
            if (!names.includes('User') || !names.includes('Post')) {
              throw new Error('expected User and Post listed');
            }
          }),
        ),
    );

    vtest(
      'two entities coexist in the same physical table without collision',
      'each entity prefixes its keys with its name, carving its own keyspace',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* userEntity.insert({ userId: 'u1', name: 'Ada' });
            yield* postEntity.insert({
              authorId: 'u1',
              postId: 'p1',
              title: 'Hello',
            });

            const user = yield* userEntity.get({ userId: 'u1' });
            const post = yield* postEntity.get({
              authorId: 'u1',
              postId: 'p1',
            });
            if (user === null || post === null) {
              throw new Error('both entities should round-trip');
            }
            if (user.value.name !== 'Ada' || post.value.title !== 'Hello') {
              throw new Error('rows must not collide');
            }
          }),
        ),
    );
  },
);
