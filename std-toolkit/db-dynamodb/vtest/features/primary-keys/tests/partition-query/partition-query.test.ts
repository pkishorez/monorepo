import { Effect, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';
import {
  DynamoTable,
  DynamoEntity,
  createDynamoDB,
} from '@std-toolkit/db-dynamodb';
import { vdescribe, vtest } from '@monorepo/vtest';

const cfg = {
  tableName: `vtest-primary-${Date.now()}`,
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  endpoint: 'http://localhost:8090',
};

const PostSchema = EntityESchema.make('Post', 'postId', {
  authorId: Schema.String,
  title: Schema.String,
}).build();

const table = DynamoTable.make(cfg).primary('pk', 'sk').build();
// pk derives from authorId, so each author is its own partition; sk = postId.
const posts = DynamoEntity.make(table)
  .eschema(PostSchema)
  .primary({ pk: ['authorId'] })
  .build();
const client = createDynamoDB(cfg);

let seeded = false;
const seed = <A>(body: Effect.Effect<A>): Promise<A> =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* client
        .createTable({ TableName: cfg.tableName, ...table.getTableSchema() })
        .pipe(
          Effect.catchIf(
            (e) => e.error._tag === 'UnknownAwsError',
            () => Effect.void,
          ),
        );
      if (!seeded) {
        for (const id of ['post-a', 'post-b', 'post-c']) {
          yield* posts.insert({ authorId: 'ada', postId: id, title: id });
        }
        // a second author, to prove partitions are isolated
        yield* posts.insert({
          authorId: 'grace',
          postId: 'post-z',
          title: 'z',
        });
        seeded = true;
      }
      return yield* body;
    }),
  );

vdescribe(
  'a partition query walks one author by sort key',
  'pk isolates the partition; the sk operator filters and orders it',
  () => {
    vtest(
      'querying a partition returns only its items, ascending',
      'pk = author selects the partition; >= null returns all ascending',
      () =>
        seed(
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
        seed(
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
        seed(
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
