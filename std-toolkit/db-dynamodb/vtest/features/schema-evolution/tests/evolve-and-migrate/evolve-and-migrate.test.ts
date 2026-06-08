import { Effect, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';
import {
  DynamoTable,
  DynamoEntity,
  createDynamoDB,
} from '@std-toolkit/db-dynamodb';
import { vdescribe, vtest } from '@monorepo/vtest';

const cfg = {
  tableName: `vtest-evolve-${Date.now()}`,
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  endpoint: 'http://localhost:8090',
};

const settingsV1 = EntityESchema.make('Settings', 'settingsId', {
  theme: Schema.String,
}).build();

const settingsV2 = EntityESchema.make('Settings', 'settingsId', {
  theme: Schema.String,
})
  .evolve('v2', { fontSize: Schema.Number }, (prev) => ({
    ...prev,
    fontSize: 14,
  }))
  .build();

const table = DynamoTable.make(cfg).primary('pk', 'sk').build();
const SettingsV1 = DynamoEntity.make(table)
  .eschema(settingsV1)
  .primary({ pk: ['settingsId'] })
  .build();
const SettingsV2 = DynamoEntity.make(table)
  .eschema(settingsV2)
  .primary({ pk: ['settingsId'] })
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
  'an evolved schema reads old items forward and migrates on write',
  'a v1 item decodes to v2 on read; update rewrites it at v2',
  () => {
    vtest(
      'a v1 item decodes forward when read through the v2 entity',
      'the upgrade fills fontSize on read; stored _v is still v1',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* SettingsV1.insert({
              settingsId: 'evo-read',
              theme: 'light',
            });

            const seen = yield* SettingsV2.get({ settingsId: 'evo-read' });
            if (seen === null) throw new Error('expected the item');
            if (seen.value.fontSize !== 14) {
              throw new Error('expected the upgrade to fill fontSize');
            }
            if (seen.meta._v !== 'v1') {
              throw new Error('on-read migration does not rewrite _v');
            }
          }),
        ),
    );

    vtest(
      'updating a stale item auto-migrates it to the latest version',
      'update runs the upgrade and rewrites the item at _v: v2',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* SettingsV1.insert({
              settingsId: 'evo-write',
              theme: 'light',
            });

            const updated = yield* SettingsV2.update(
              { settingsId: 'evo-write' },
              { update: { theme: 'dark' } },
            );
            if (updated.value.theme !== 'dark')
              throw new Error('expected the patch applied');
            if (updated.value.fontSize !== 14)
              throw new Error('expected the migrated field');
            if (updated.meta._v !== 'v2')
              throw new Error('expected the item rewritten at v2');
          }),
        ),
    );
  },
);
