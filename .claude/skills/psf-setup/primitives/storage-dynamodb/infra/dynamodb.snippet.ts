// Copy to src/server/services/__NAME__/dynamodb.ts (rpc-worker) or beside the object (rpc-durable-object); "local" credentials select DynamoDB Local.
import { Config, Effect, Redacted } from 'effect';
import { DynamoDB } from 'std-toolkit/db/dynamodb';
import { __NAME__Table } from '../src/shared/contracts/__NAME__-table/index.ts';

const secret = (key: string) =>
  Effect.map(
    Config.redacted(key).pipe(Config.withDefault(Redacted.make('local'))),
    Redacted.value,
  );

export const __NAME__Settings = Effect.gen(function* () {
  const accessKeyId = yield* secret('APP_AWS_ACCESS_KEY_ID');
  const secretAccessKey = yield* secret('APP_AWS_SECRET_ACCESS_KEY');
  const local = accessKeyId === 'local';
  return {
    tableName: yield* Config.string('__NAME_ENV___TABLE_NAME'),
    region: local
      ? 'local'
      : yield* Config.string('AWS_REGION').pipe(
          Config.withDefault('us-east-1'),
        ),
    endpoint: local ? 'http://localhost:8090' : '',
    accessKeyId,
    secretAccessKey,
  };
});

export const make__Name__Database = Effect.map(
  __NAME__Settings,
  ({ tableName, region, endpoint, accessKeyId, secretAccessKey }) =>
    DynamoDB.make(__NAME__Table, {
      tableName,
      region,
      credentials: { accessKeyId, secretAccessKey },
      ...(endpoint !== '' ? { endpoint } : {}),
    }),
);
