import { Stack, Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';

const isProdStage = (stage: string): boolean => stage === 'prod';
const isPrStage = (stage: string): boolean => /^pr\d+$/.test(stage);
const isDeployedStage = (stage: string): boolean =>
  isProdStage(stage) || isPrStage(stage);

/**
 * Accident-guard (NOT a security boundary — the real protection is not
 * holding prod Cloudflare credentials). Deployed stages are reconciled by CI
 * (deploy.yml: prod on main, pr<N> previews per PR) or the manual
 * `deploy:prod` script — both opt in via ALLOW_DEPLOY=true. A stray
 * `alchemy deploy --stage prod` from a shell or an agent trips here.
 */
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

    // `prod` binds docs.kishore.app; per-PR previews deploy as `pr<N>` on
    // pr<N>-docs.kishore.app and are destroyed when the PR closes. Everything
    // else is a local dev_<user> stage with no custom domain.
    const isLocal = !isDeployedStage(stage);
    const domain = isLocal
      ? undefined
      : isPrStage(stage)
        ? `${stage}-docs.kishore.app`
        : 'docs.kishore.app';

    return {
      compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
      dev: isLocal ? { port: 3000 } : undefined,
      domain,
    };
  }),
);

export type WorkerEnv = Cloudflare.InferEnv<typeof Worker>;

export default Stack(
  'Docs',
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Worker,
);
