import { AlchemyContext, Stage } from 'alchemy';
import { Effect } from 'effect';

/*
 * Which stage is being run, whether it may be, and where the site is
 * served in it: `hands.kishore.app` for prod, `pr<N>-hands.kishore.app`
 * for a PR's preview, and Portless's name under `alchemy dev`.
 */

const isProdStage = (stage: string): boolean => stage === 'prod';
const isPrStage = (stage: string): boolean => /^pr\d+$/.test(stage);

export const isDeployedStage = (stage: string): boolean =>
  isProdStage(stage) || isPrStage(stage);

const assertStageIsSafe = (stage: string): void => {
  if (isDeployedStage(stage) && process.env.ALLOW_DEPLOY !== 'true') {
    throw new Error(
      `Refusing to target deployed stage "${stage}" without ALLOW_DEPLOY=true. ` +
        `Deploys go through deploy-hands.yml or \`pnpm deploy:prod\`.`,
    );
  }
};

/** The site's host on a deployed stage: `hands.kishore.app`, `pr12-hands.kishore.app`. */
const deployedHost = (stage: string) =>
  `${isProdStage(stage) ? '' : `${stage}-`}hands.kishore.app`;

/** Where the stage being run serves the site, once it is checked it may be run. */
export const where = Effect.gen(function* () {
  const stage = yield* Stage;
  const { dev } = yield* AlchemyContext;
  assertStageIsSafe(stage);
  const deployed = !dev && isDeployedStage(stage);
  return {
    dev,
    /** The site's own domain, deployed; none elsewhere. */
    domain: deployed ? deployedHost(stage) : undefined,
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
