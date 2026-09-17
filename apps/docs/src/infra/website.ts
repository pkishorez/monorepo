import { Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect } from 'effect';
import { DurableWebRtc } from './durable-webrtc/index.ts';
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

    const durableWebRtc = yield* DurableWebRtc;

    return {
      compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
      dev: devConfigFor(isLocal),
      domain: domainFor(stage),
      env: {
        DURABLE_WEBRTC_SIGNALING: durableWebRtc.signaling,
      },
    };
  }),
);

export type WorkerEnv = Cloudflare.InferEnv<typeof Website>;
