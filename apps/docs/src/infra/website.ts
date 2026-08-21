import { Stage } from 'alchemy';
import * as Output from 'alchemy/Output';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Config, Effect } from 'effect';
import { BankTable, DynamoDO, SqliteDO } from './bank/index.ts';
import {
  assertStageIsSafe,
  devConfigFor,
  domainFor,
  isDeployedStage,
} from './stage.ts';

export const Website = Cloudflare.Website.Vite(
  'Worker',
  Effect.gen(function* () {
    const stage = yield* Stage;
    assertStageIsSafe(stage);

    const isLocal = !isDeployedStage(stage);

    // Deployed stages must carry real bank AWS credentials — fail the
    // deploy here instead of shipping the runtime's "local" fallbacks.
    if (!isLocal) {
      yield* Effect.orDie(Config.redacted('BANK_AWS_ACCESS_KEY_ID'));
      yield* Effect.orDie(Config.redacted('BANK_AWS_SECRET_ACCESS_KEY'));
    }

    yield* BankTable;

    const urlOf = (
      name: string,
      worker: { url: Output.Output<string | undefined> },
    ) =>
      Output.map(worker.url, (url) => {
        if (!url) {
          throw new Error(
            `${name} worker has no URL — enable workersDev or give it a domain.`,
          );
        }
        return url;
      });

    const sqliteDo = yield* SqliteDO;
    const dynamoDo = yield* DynamoDO;

    return {
      compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
      dev: devConfigFor(isLocal),
      domain: domainFor(stage),
      env: {
        VITE_BANK_SQLITE_DO_URL: urlOf('SqliteDO', sqliteDo),
        VITE_BANK_DYNAMO_DO_URL: urlOf('DynamoDO', dynamoDo),
      },
    };
  }),
);

export type WorkerEnv = Cloudflare.InferEnv<typeof Website>;
