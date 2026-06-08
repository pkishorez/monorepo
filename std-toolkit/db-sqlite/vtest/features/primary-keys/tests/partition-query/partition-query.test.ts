import Database from 'better-sqlite3';
import { Effect, Layer, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';
import { SQLiteTable, SQLiteEntity, type SqliteDB } from '@std-toolkit/sqlite';
import { SqliteDBBetterSqlite3 } from '@std-toolkit/sqlite/adapters/better-sqlite3';
import { vdescribe, vtest } from '@monorepo/vtest';

const PostSchema = EntityESchema.make('Post', 'postId', {
  authorId: Schema.String,
  title: Schema.String,
}).build();

const table = SQLiteTable.make({ tableName: 'std_data' })
  .primary('pk', 'sk')
  .build();

// pk derives from authorId, so each author is its own partition; sk = postId.
const posts = SQLiteEntity.make(table)
  .eschema(PostSchema)
  .primary({ pk: ['authorId'] })
  .build();

const seeded = <A>(body: Effect.Effect<A, unknown, SqliteDB>): Promise<A> => {
  const layer: Layer.Layer<SqliteDB> = SqliteDBBetterSqlite3(
    new Database(':memory:'),
  );
  return Effect.runPromise(
    Effect.gen(function* () {
      yield* table.setup();
      for (const id of ['post-a', 'post-b', 'post-c']) {
        yield* posts.insert({ authorId: 'ada', postId: id, title: id });
      }
      // a second author, to prove partitions are isolated
      yield* posts.insert({ authorId: 'grace', postId: 'post-z', title: 'z' });
      return yield* body;
    }).pipe(Effect.provide(layer)),
  );
};

vdescribe(
  'a partition query walks one author by sort key',
  'pk isolates the partition; the sk operator filters and orders it',
  () => {
    vtest(
      'querying a partition returns only its records, ascending',
      'pk = author selects the partition; >= null returns all ascending',
      () =>
        seeded(
          Effect.gen(function* () {
            const result = yield* posts.query('primary', {
              pk: { authorId: 'ada' },
              sk: { '>=': null },
            });
            const ids = result.items.map((i) => i.value.postId);
            if (ids.join(',') !== 'post-a,post-b,post-c') {
              throw new Error(`unexpected order: ${ids.join(',')}`);
            }
          }),
        ),
    );

    vtest(
      'the sort-key operator filters and chooses direction',
      '<= null reads the same partition in descending order',
      () =>
        seeded(
          Effect.gen(function* () {
            const desc = yield* posts.query('primary', {
              pk: { authorId: 'ada' },
              sk: { '<=': null },
            });
            const ids = desc.items.map((i) => i.value.postId);
            if (ids[0] !== 'post-c') throw new Error('expected descending');

            const from = yield* posts.query('primary', {
              pk: { authorId: 'ada' },
              sk: { '>=': 'post-b' },
            });
            const fromIds = from.items.map((i) => i.value.postId);
            if (fromIds.join(',') !== 'post-b,post-c') {
              throw new Error(`expected b,c got ${fromIds.join(',')}`);
            }
          }),
        ),
    );

    vtest(
      'limit caps a partition query',
      'pagination is a limit plus a sort-key cursor',
      () =>
        seeded(
          Effect.gen(function* () {
            const page = yield* posts.query(
              'primary',
              { pk: { authorId: 'ada' }, sk: { '>=': null } },
              { limit: 2 },
            );
            if (page.items.length !== 2) throw new Error('expected 2');
          }),
        ),
    );
  },
);
