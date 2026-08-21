import { Stack, Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as DynamoDB from 'alchemy/AWS/DynamoDB';
import { providers as awsProviders } from 'alchemy/AWS';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { DynamoDB as StdDynamoDB } from 'std-toolkit/db/dynamodb';
import BankApi from './src/demos/bank/rpc/server/api.ts';
import {
  dynamo,
  dynamoTable,
  tableExists,
} from './src/demos/bank/rpc/server/dynamo.ts';
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

// The bank demo's table shape lives once in `bankTable` (std-toolkit's
// StdTable builder); derive Alchemy's AWS.DynamoDB.Table props from the same
// definition the raw SDK client uses locally so the two never drift apart.
const bankTableDefinition = StdDynamoDB.getTableDefinition(bankTable);
const bankTableAttributes = Object.fromEntries(
  bankTableDefinition.AttributeDefinitions.map((attribute) => [
    attribute.AttributeName,
    attribute.AttributeType,
  ]),
);
const bankTablePartitionKey = bankTableDefinition.KeySchema.find(
  (key) => key.KeyType === 'HASH',
)!.AttributeName;
const bankTableSortKey = bankTableDefinition.KeySchema.find(
  (key) => key.KeyType === 'RANGE',
)?.AttributeName;

export const Worker = Cloudflare.Website.Vite(
  'Worker',
  Effect.gen(function* () {
    const stage = yield* Stage;
    assertStageIsSafe(stage);

    const isLocal = !isDeployedStage(stage);

    if (isLocal) {
      // Local dev talks to a local DynamoDB instance the raw SDK client
      // can create-if-missing itself — no Alchemy-managed AWS resource.
      yield* dynamo.setup.pipe(
        Effect.catch((error) =>
          tableExists(error) ? Effect.void : Effect.die(error),
        ),
      );
    } else {
      // Deployed stages get a real, Alchemy-tracked table: creation,
      // drift, and teardown (on PR close) are Alchemy's job here.
      yield* DynamoDB.Table('BankTable', {
        tableName: dynamoTable,
        partitionKey: bankTablePartitionKey,
        sortKey: bankTableSortKey,
        attributes: bankTableAttributes,
        globalSecondaryIndexes: bankTableDefinition.GlobalSecondaryIndexes,
        billingMode: bankTableDefinition.BillingMode,
      });
    }

    const domain = isLocal
      ? undefined
      : isProdStage(stage)
        ? 'docs.kishore.app'
        : `${stage}-docs.kishore.app`;

    return {
      compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
      dev: isLocal ? { port: 3000 } : undefined,
      domain,
      env: {
        BANK_API: BankApi,
      },
    };
  }),
);

export type WorkerEnv = Cloudflare.InferEnv<typeof Worker>;

export default Stack(
  'Docs',
  {
    providers: Layer.mergeAll(Cloudflare.providers(), awsProviders()),
    state: Cloudflare.state(),
  },
  Worker,
);
