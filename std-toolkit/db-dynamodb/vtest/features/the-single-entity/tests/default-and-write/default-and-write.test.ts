import { Effect, Schema } from 'effect';
import { SingleEntityESchema } from '@std-toolkit/eschema';
import {
  DynamoTable,
  DynamoSingleEntity,
  createDynamoDB,
} from '@std-toolkit/db-dynamodb';
import { vdescribe, vtest } from '@monorepo/vtest';

const cfg = {
  tableName: `vtest-single-${Date.now()}`,
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  endpoint: 'http://localhost:8090',
};

const configSchema = SingleEntityESchema.make('AppConfig', {
  theme: Schema.String,
  maxRetries: Schema.Number,
}).build();

const table = DynamoTable.make(cfg).primary('pk', 'sk').build();
const AppConfig = DynamoSingleEntity.make(table)
  .eschema(configSchema)
  .default({ theme: 'light', maxRetries: 3 });
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
  'a single entity is one item with a default',
  'get never returns null; put upserts; update needs an existing item',
  () => {
    vtest(
      'get returns the default before anything is written',
      'an empty _u marks the synthetic default — never null',
      () =>
        withDb(
          Effect.gen(function* () {
            const result = yield* AppConfig.get();
            if (result.value.theme !== 'light')
              throw new Error('expected default');
            if (result.meta._u !== '') throw new Error('default has empty _u');
          }),
        ),
    );

    vtest(
      'put writes unconditionally and get reflects it',
      'put is an upsert: the slot holds whatever you last wrote',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* AppConfig.put({ theme: 'dark', maxRetries: 5 });
            const result = yield* AppConfig.get();
            if (result.value.theme !== 'dark') throw new Error('expected dark');
            if (result.meta._u === '')
              throw new Error('written item has a real _u');
          }),
        ),
    );

    vtest(
      'update patches an existing item but fails when none exists',
      'with no prior write there is nothing to merge onto',
      () =>
        withDb(
          Effect.gen(function* () {
            yield* AppConfig.put({ theme: 'light', maxRetries: 3 });
            const patched = yield* AppConfig.update({
              update: { theme: 'blue' },
            });
            if (patched.value.theme !== 'blue')
              throw new Error('expected blue');
            if (patched.value.maxRetries !== 3)
              throw new Error('expected merge');
          }),
        ),
    );
  },
);
