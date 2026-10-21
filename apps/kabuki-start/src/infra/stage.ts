import { AlchemyContext, Stage } from 'alchemy';
import { Effect } from 'effect';

/*
 * Which stage is being run, whether it may be, and where each Worker is
 * served in it. Sign-in works only where the site, the API Workers and the
 * Auth Worker share a cookie domain: `.kishore.computer` under
 * `alchemy dev`, `.kishore.app` on a deployed stage. A personal stage
 * deployed to `workers.dev` is served, but signs nobody in.
 */

const isProdStage = (stage: string): boolean => stage === 'prod';
const isDemoStage = (stage: string): boolean => stage === 'demo';
const isPrStage = (stage: string): boolean => /^pr\d+$/.test(stage);

export const isDeployedStage = (stage: string): boolean =>
  isProdStage(stage) || isDemoStage(stage) || isPrStage(stage);

const assertStageIsSafe = (stage: string): void => {
  if (isDeployedStage(stage) && process.env.ALLOW_DEPLOY !== 'true') {
    throw new Error(
      `Refusing to target deployed stage "${stage}" without ALLOW_DEPLOY=true. ` +
        `Deploys go through deploy-kabuki-start.yml or \`pnpm deploy:prod\`.`,
    );
  }
};

/** A Worker's host on a deployed stage: `start.kishore.app`, `hello-http-start.kishore.app`, `pr12-start.kishore.app`. */
const deployedHost = (stage: string, api?: string) =>
  `${[isProdStage(stage) ? undefined : stage, api, 'start'].filter(Boolean).join('-')}.kishore.app`;

/** A Worker's host under `alchemy dev`, given by Portless: the site's is its `portless.json` name. */
const devHost = (api?: string) =>
  api ? `${api}-start.kishore.computer` : 'kabuki-start.kishore.computer';

/**
 * A Worker's URL under `alchemy dev`. The site's is the one Portless gave
 * it, which in a linked git worktree starts with the branch:
 * `replica.kabuki-start.kishore.computer`. The API Workers' are aliased
 * without one, so every worktree calls the same names.
 */
const devUrl = (api?: string) =>
  (api ? undefined : process.env.PORTLESS_URL) ?? `https://${devHost(api)}`;

/** Where the stage being run serves things, once it is checked it may be run. */
export const where = Effect.gen(function* () {
  const stage = yield* Stage;
  const { dev } = yield* AlchemyContext;
  assertStageIsSafe(stage);
  const deployed = !dev && isDeployedStage(stage);
  return {
    dev,
    /** Each Worker's own domain, deployed; none elsewhere. */
    domain: (api?: string) => (deployed ? deployedHost(stage, api) : undefined),
    /** Each Worker's URL as the browser calls it, if it is known before it is made. */
    url: (api?: string) =>
      dev
        ? devUrl(api)
        : deployed
          ? `https://${deployedHost(stage, api)}`
          : undefined,
    /** The Auth Worker the stage signs in with. */
    auth: dev ? 'https://auth.kishore.computer' : 'https://auth.kishore.app',
  };
});

/** The port Portless gave `pnpm dev`, for the site under `alchemy dev`. */
export const portlessPort = (): number => {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      'PORT must be assigned by portless. Start the app with `pnpm dev`.',
    );
  }
  return port;
};
