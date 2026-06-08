import { Effect, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';
import {
  DynamoTable,
  DynamoEntity,
  EntityRegistry,
  createDynamoDB,
} from '@std-toolkit/db-dynamodb';
import { vdescribe, vtest } from '@monorepo/vtest';

const cfg = {
  tableName: `vtest-registry-${Date.now()}`,
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  endpoint: 'http://localhost:8090',
};

const UserSchema = EntityESchema.make('User', 'userId', {
  name: Schema.String,
}).build();
const OrderSchema = EntityESchema.make('Order', 'orderId', {
  userId: Schema.String,
  total: Schema.Number,
}).build();

const table = DynamoTable.make(cfg).primary('pk', 'sk').build();
const userEntity = DynamoEntity.make(table)
  .eschema(UserSchema)
  .primary()
  .build();
const orderEntity = DynamoEntity.make(table)
  .eschema(OrderSchema)
  .primary({ pk: ['userId'] })
  .build();
const registry = EntityRegistry.make(table)
  .register(userEntity)
  .register(orderEntity)
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
  'one registry gathers many entities on one table',
  'look entities up by name, and they never collide',
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
            if (!names.includes('User') || !names.includes('Order')) {
              throw new Error('expected User and Order listed');
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
            yield* userEntity.insert({ userId: 'reg-u1', name: 'Ada' });
            yield* orderEntity.insert({
              userId: 'reg-u1',
              orderId: 'reg-o1',
              total: 10,
            });

            const user = yield* userEntity.get({ userId: 'reg-u1' });
            const order = yield* orderEntity.get({
              userId: 'reg-u1',
              orderId: 'reg-o1',
            });
            if (user === null || order === null) {
              throw new Error('both entities should round-trip');
            }
            if (user.value.name !== 'Ada' || order.value.total !== 10) {
              throw new Error('items must not collide');
            }
          }),
        ),
    );
  },
);
