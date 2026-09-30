import { Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect } from 'effect';
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

    return {
      compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
      dev: devConfigFor(!isDeployedStage(stage)),
      domain: domainFor(stage),
    };
  }),
);
