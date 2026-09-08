import { Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect } from 'effect';
import { assertStageIsSafe, devConfigFor, domainFor } from './stage.ts';

export const Website = Cloudflare.Website.Vite(
  'Website',
  Effect.gen(function* () {
    const stage = yield* Stage;
    assertStageIsSafe(stage);

    return {
      compatibility: { date: '2025-09-02', flags: ['nodejs_compat'] },
      dev: devConfigFor(stage),
      domain: domainFor(stage),
    };
  }),
);

export type WorkerEnv = Cloudflare.InferEnv<typeof Website>;
