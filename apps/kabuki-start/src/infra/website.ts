import { Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect } from 'effect';
import {
  assertStageIsSafe,
  devConfigFor,
  domainFor,
  isDeployedStage,
} from './stage.ts';

/**
 * The site: one Worker in front of the built assets. Start's Vite plugin
 * gives the Worker its entry, so there is no `main`.
 */
export const Website = Cloudflare.Website.Vite(
  'Site',
  Effect.gen(function* () {
    const stage = yield* Stage;
    assertStageIsSafe(stage);

    const isLocal = !isDeployedStage(stage);

    return {
      compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
      dev: devConfigFor(isLocal),
      domain: domainFor(stage),
    };
  }),
);

export type WorkerEnv = Cloudflare.InferEnv<typeof Website>;
