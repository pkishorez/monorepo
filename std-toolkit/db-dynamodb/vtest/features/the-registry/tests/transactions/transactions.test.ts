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
  tableName: `vtest-txn-${Date.now()}`,
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  endpoint: 'http://localhost:8090',
};

const CounterSchema = EntityESchema.make('Counter', 'counterId', {
  count: Schema.Number,
}).build();

const table = DynamoTable.make(cfg).primary('pk', 'sk').build();
const counters = DynamoEntity.make(table)
  .eschema(CounterSchema)
  .primary()
  .build();
const registry = EntityRegistry.make(table).register(counters).build();
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
  'a transaction is all-or-nothing across entities',
  'transact commits every op together, or rolls them all back',
  () => {
    vtest(
      'a successful transaction commits all writes',
      'insertOp builds the op; transact([...]) commits them together',
      () =>
        withDb(
          Effect.gen(function* () {
            const opA = yield* counters.insertOp({
              counterId: 'txn-a',
              count: 1,
            });
            const opB = yield* counters.insertOp({
              counterId: 'txn-b',
              count: 2,
            });
            yield* registry.transact([opA, opB]);

            const a = yield* counters.get({ counterId: 'txn-a' });
            const b = yield* counters.get({ counterId: 'txn-b' });
            if (a === null || b === null) throw new Error('both should commit');
          }),
        ),
    );

    vtest(
      'a failing op rolls every write in the transaction back',
      'one impossible op (insert over an existing item) aborts the whole batch',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* counters.insert({ counterId: 'txn-existing', count: 9 });

            const newOp = yield* counters.insertOp({
              counterId: 'txn-sibling',
              count: 1,
            });
            // insertOp asserts the item does not exist; this one already does.
            const clashOp = yield* counters.insertOp({
              counterId: 'txn-existing',
              count: 2,
            });

            const result = yield* registry
              .transact([newOp, clashOp])
              .pipe(Effect.result);
            if (result._tag !== 'Failure') throw new Error('expected failure');

            const sibling = yield* counters.get({ counterId: 'txn-sibling' });
            if (sibling !== null) {
              throw new Error('sibling insert should have rolled back');
            }
          }),
        ),
    );
  },
);
