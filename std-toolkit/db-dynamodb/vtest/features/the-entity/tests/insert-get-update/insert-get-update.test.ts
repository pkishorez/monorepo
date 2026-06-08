import { Effect, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';
import {
  DynamoTable,
  DynamoEntity,
  createDynamoDB,
} from '@std-toolkit/db-dynamodb';
import { vdescribe, vtest } from '@monorepo/vtest';

const cfg = {
  tableName: `vtest-entity-iget-${Date.now()}`,
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  endpoint: 'http://localhost:8090',
};

const UserSchema = EntityESchema.make('User', 'userId', {
  email: Schema.String,
  name: Schema.String,
}).build();

const table = DynamoTable.make(cfg).primary('pk', 'sk').build();
const users = DynamoEntity.make(table).eschema(UserSchema).primary().build();
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
              userId: 'iget-u1',
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
      'a missing item is null, never a thrown error',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* users.insert({
              userId: 'iget-u2',
              email: 'grace@example.com',
              name: 'Grace',
            });
            const hit = yield* users.get({ userId: 'iget-u2' });
            if (hit === null || hit.value.name !== 'Grace') {
              throw new Error('expected Grace');
            }
            const miss = yield* users.get({ userId: 'nope' });
            if (miss !== null) throw new Error('expected null for a miss');
          }),
        ),
    );

    vtest(
      'update merges a partial onto the existing item',
      'unspecified fields are preserved; only the patch changes',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* users.insert({
              userId: 'iget-u3',
              email: 'ada@example.com',
              name: 'Ada',
            });
            const updated = yield* users.update(
              { userId: 'iget-u3' },
              { update: { name: 'Ada Lovelace' } },
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
