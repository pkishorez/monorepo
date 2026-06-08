import { Effect, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';
import {
  DynamoTable,
  DynamoEntity,
  createDynamoDB,
} from '@std-toolkit/db-dynamodb';
import { vdescribe, vtest } from '@monorepo/vtest';

const cfg = {
  tableName: `vtest-entity-del-${Date.now()}`,
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  endpoint: 'http://localhost:8090',
};

const UserSchema = EntityESchema.make('User', 'userId', {
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
  'delete is a soft delete',
  'the item stays, marked _d: true, so sync sees deletion as a change',
  () => {
    vtest(
      'delete flips _d and the item is still readable',
      'deletion is an event, not a gap — get still finds the item',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* users.insert({ userId: 'del-u1', name: 'Ada' });
            const deleted = yield* users.delete({ userId: 'del-u1' });
            if (deleted.meta._d !== true) throw new Error('expected _d true');

            const after = yield* users.get({ userId: 'del-u1' });
            if (after === null) throw new Error('soft delete keeps the item');
            if (after.meta._d !== true)
              throw new Error('expected marked deleted');
          }),
        ),
    );

    vtest(
      'deleting a missing item fails',
      'there is nothing to mark, so delete reports NoItemToDelete',
      () =>
        withDb(
          Effect.gen(function* () {
            const err = yield* users
              .delete({ userId: 'ghost' })
              .pipe(Effect.flip);
            if (err.error._tag !== 'NoItemToDelete') {
              throw new Error('expected NoItemToDelete');
            }
          }),
        ),
    );
  },
);
