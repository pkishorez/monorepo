import { Stack, Stage } from 'alchemy';
import * as AWS from 'alchemy/AWS';
import * as AWSCredentials from 'alchemy/AWS/Credentials';
import * as DynamoDB from 'alchemy/AWS/DynamoDB';
import * as AWSRegion from 'alchemy/AWS/Region';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import { DynamoDB as StdDynamoDB } from 'std-toolkit/db/dynamodb';
import { bankTable } from './src/demos/bank/std-table/table/index.ts';

const isProdStage = (stage: string): boolean => stage === 'prod';
const isDemoStage = (stage: string): boolean => stage === 'demo';
const isPrStage = (stage: string): boolean => /^pr\d+$/.test(stage);
const isDeployedStage = (stage: string): boolean =>
  isProdStage(stage) || isDemoStage(stage) || isPrStage(stage);

const assertStageIsSafe = (stage: string): void => {
  if (isDeployedStage(stage) && process.env.ALLOW_DEPLOY !== 'true') {
    throw new Error(
      `Refusing to target deployed stage "${stage}" without ALLOW_DEPLOY=true. ` +
        `Deploys go through deploy.yml or \`pnpm deploy:prod\`.`,
    );
  }
};

const env = (key: string): string => process.env[key] ?? '';

type StdTableTopology = Parameters<typeof StdDynamoDB.getTableDefinition>[0];

const tablePropsOf = (table: StdTableTopology): DynamoDB.TableProps => {
  const topology = StdDynamoDB.getTableDefinition(table);
  const keyOf = (type: 'HASH' | 'RANGE') =>
    topology.KeySchema.find((key) => key.KeyType === type)?.AttributeName;
  const partitionKey = keyOf('HASH');
  if (partitionKey === undefined)
    throw new Error('StdTable definition has no partition key.');
  return {
    partitionKey,
    ...(keyOf('RANGE') === undefined ? {} : { sortKey: keyOf('RANGE') }),
    attributes: Object.fromEntries(
      topology.AttributeDefinitions.map((attribute) => [
        attribute.AttributeName,
        attribute.AttributeType,
      ]),
    ),
    ...(topology.LocalSecondaryIndexes === undefined
      ? {}
      : { localSecondaryIndexes: topology.LocalSecondaryIndexes }),
    ...(topology.GlobalSecondaryIndexes === undefined
      ? {}
      : { globalSecondaryIndexes: topology.GlobalSecondaryIndexes }),
    billingMode: topology.BillingMode,
  };
};

export const Worker = Cloudflare.Website.Vite(
  'Worker',
  Effect.gen(function* () {
    const stage = yield* Stage;
    assertStageIsSafe(stage);

    const isLocal = !isDeployedStage(stage);
    const domain = isLocal
      ? undefined
      : isProdStage(stage)
        ? 'docs.kishore.app'
        : `${stage}-docs.kishore.app`;

    const table = isLocal
      ? undefined
      : yield* DynamoDB.Table('BankTable', {
          ...tablePropsOf(bankTable),
          deletionProtectionEnabled: isProdStage(stage),
        });

    return {
      compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
      dev: isLocal ? { port: 3000 } : undefined,
      domain,
      ...(table === undefined
        ? {}
        : {
            env: {
              BANK_DYNAMODB_TABLE: table.tableName,
              BANK_DYNAMODB_REGION: env('AWS_REGION'),
              BANK_DYNAMODB_ENDPOINT: '',
              AWS_ACCESS_KEY_ID: Redacted.make(env('BANK_AWS_ACCESS_KEY_ID')),
              AWS_SECRET_ACCESS_KEY: Redacted.make(
                env('BANK_AWS_SECRET_ACCESS_KEY'),
              ),
            },
          }),
    };
  }),
);

export type WorkerEnv = Cloudflare.InferEnv<typeof Worker>;

export default Stack(
  'Docs',
  {
    providers: Layer.mergeAll(
      Cloudflare.providers(),
      AWS.providers(),
      AWSCredentials.fromEnvironment,
      AWSRegion.fromEnvironment,
    ),
    state: Cloudflare.state(),
  },
  Worker,
);
