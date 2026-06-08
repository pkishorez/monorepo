import { Effect, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';
import {
  DynamoTable,
  DynamoEntity,
  createDynamoDB,
} from '@std-toolkit/db-dynamodb';
import { vdescribe, vtest } from '@monorepo/vtest';

const cfg = {
  tableName: `vtest-gsi-${Date.now()}`,
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  endpoint: 'http://localhost:8090',
};

const UserSchema = EntityESchema.make('User', 'userId', {
  email: Schema.String,
  name: Schema.String,
}).build();

const table = DynamoTable.make(cfg)
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const users = DynamoEntity.make(table)
  .eschema(UserSchema)
  .primary()
  .index('GSI1', 'byEmail', { pk: ['email'] })
  .build();
const client = createDynamoDB(cfg);

const withDb = <A>(body: Effect.Effect<A>): Promise<A> =>
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
      return yield* body;
    }),
  );

vdescribe(
  'a secondary index is a declared, alternate access pattern',
  'query by email instead of id; update keeps the index in sync',
  () => {
    vtest(
      'items are reachable through the secondary index',
      'byEmail partitions users by their email field',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* users.insert({
              userId: 'gsi-u1',
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
      'updating the indexed field moves the item across partitions',
      'no manual index upkeep: the old email empties, the new one fills',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* users.insert({
              userId: 'gsi-u2',
              email: 'old@example.com',
              name: 'Grace',
            });
            yield* users.update(
              { userId: 'gsi-u2' },
              { update: { email: 'new@example.com' } },
            );

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
