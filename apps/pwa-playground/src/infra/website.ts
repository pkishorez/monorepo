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

    // Alchemy rebuilds only when hashed files change, never for env vars
    // alone. CI writes the build switches (BUILD_LABEL, PWA_ENABLED,
    // PWA_PRESET, PWA_UPDATE_MODE) to build-env.txt, which the default hash picks up.

    return {
      compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
      dev: devConfigFor(!isDeployedStage(stage)),
      domain: domainFor(stage),
    };
  }),
);
