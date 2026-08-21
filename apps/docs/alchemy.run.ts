import { Stack, Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import BankApi from './src/demos/bank/rpc/server/api.ts';
import { dynamo, tableExists } from './src/demos/bank/rpc/server/dynamo.ts';

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

export const Worker = Cloudflare.Website.Vite(
  'Worker',
  Effect.gen(function* () {
    const stage = yield* Stage;
    assertStageIsSafe(stage);

    yield* dynamo.setup.pipe(
      Effect.catch((error) =>
        tableExists(error) ? Effect.void : Effect.die(error),
      ),
    );

    const isLocal = !isDeployedStage(stage);
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
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Worker,
);
