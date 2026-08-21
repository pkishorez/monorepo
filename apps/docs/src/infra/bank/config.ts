import { Config, Effect, Redacted } from 'effect';

const secret = (key: string) =>
  Effect.map(
    Config.redacted(key).pipe(Config.withDefault(Redacted.make('local'))),
    Redacted.value,
  );

export const dynamoSettings = Effect.gen(function* () {
  const accessKeyId = yield* secret('BANK_AWS_ACCESS_KEY_ID');
  const secretAccessKey = yield* secret('BANK_AWS_SECRET_ACCESS_KEY');
  const defaults =
    accessKeyId === 'local'
      ? { region: 'local', endpoint: 'http://localhost:8090' }
      : {
          region: yield* Config.string('AWS_REGION').pipe(
            Config.withDefault('us-east-1'),
          ),
          endpoint: '',
        };
  return {
    tableName: yield* Config.string('BANK_DYNAMODB_TABLE').pipe(
      Config.withDefault('std-bank-v3'),
    ),
    region: yield* Config.string('BANK_DYNAMODB_REGION').pipe(
      Config.withDefault(defaults.region),
    ),
    endpoint: yield* Config.string('BANK_DYNAMODB_ENDPOINT').pipe(
      Config.withDefault(defaults.endpoint),
    ),
    accessKeyId,
    secretAccessKey,
  };
});
