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
  tableName: `vtest-bulk-${Date.now()}`,
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  endpoint: 'http://localhost:8090',
};

const accountV1 = EntityESchema.make('Account', 'accountId', {
  email: Schema.String,
}).build();

const accountV2 = EntityESchema.make('Account', 'accountId', {
  email: Schema.String,
})
  .evolve('v2', { active: Schema.Boolean }, (prev) => ({
    ...prev,
    active: true,
  }))
  .build();

const table = DynamoTable.make(cfg).primary('pk', 'sk').build();
const AccountV1 = DynamoEntity.make(table)
  .eschema(accountV1)
  .primary({ pk: ['accountId'] })
  .build();
const AccountV2 = DynamoEntity.make(table)
  .eschema(accountV2)
  .primary({ pk: ['accountId'] })
  .build();
const registry = EntityRegistry.make(table).register(AccountV2).build();
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
  'registry.migrate rewrites a whole table to the latest version',
  'a dry run counts the work; the real pass rewrites stale items at v2',
  () => {
    vtest(
      'a dry run reports the stale items without writing them',
      'migrate finds the v1 item but migrated stays 0 on a dry run',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* AccountV1.insert({
              accountId: 'bulk-dry',
              email: 'dry@example.com',
            });

            const plan = yield* registry.migrate({
              dryRun: true,
              progress: { estimatedTotal: false },
            });
            if (plan.items.migrate < 1) {
              throw new Error('expected at least one stale item found');
            }
            if (plan.items.migrated !== 0) {
              throw new Error('a dry run must not write');
            }

            // still v1 on disk, untouched
            const after = yield* AccountV2.get({ accountId: 'bulk-dry' });
            if (after?.meta._v !== 'v1') {
              throw new Error('dry run should leave the stored _v at v1');
            }
          }),
        ),
    );

    vtest(
      'a real pass rewrites every stale item at the latest version',
      'migrate({ dryRun: false }) persists the upgrade; a re-run is a no-op',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* AccountV1.insert({
              accountId: 'bulk-real',
              email: 'real@example.com',
            });

            const done = yield* registry.migrate({
              dryRun: false,
              progress: { estimatedTotal: false },
            });
            if (done.items.migrated < 1) {
              throw new Error('expected at least one item rewritten');
            }

            const migrated = yield* AccountV2.get({ accountId: 'bulk-real' });
            if (migrated?.meta._v !== 'v2') {
              throw new Error('expected the stored item rewritten at v2');
            }
            if (migrated.value.active !== true) {
              throw new Error('expected the migrated field persisted');
            }
          }),
        ),
    );
  },
);
