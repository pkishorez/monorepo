import { AlchemyContext, Stage } from 'alchemy';
import { Effect } from 'effect';

/*
 * Which stage is being run, whether it may be, where each Worker is served
 * in it, and how it signs in. Sign-in through the Auth Worker works only
 * where the site, the Machines Worker and the Auth Worker share a cookie
 * domain: `.kishore.computer` under `alchemy dev`, `.kishore.app` on a
 * deployed stage. Under `alchemy dev` only, `AUTH=local` signs in by name
 * with auth-toolkit's Local mode instead, with no Auth Worker.
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
        `Deploy with \`pnpm deploy:prod\`.`,
    );
  }
};

/** Whether `AUTH=local` asks for Local mode, which only `alchemy dev` may run. */
const localAuth = (dev: boolean): boolean => {
  if (process.env.AUTH !== 'local') return false;
  if (!dev) {
    throw new Error(
      'AUTH=local signs anyone in by name: it runs only under `alchemy dev` (`pnpm dev:local`), never deployed.',
    );
  }
  return true;
};

/** A Worker's host on a deployed stage: `code.kishore.app`, `api-code.kishore.app`, `pr12-api-code.kishore.app`. */
const deployedHost = (stage: string, api?: string) =>
  `${[isProdStage(stage) ? undefined : stage, api, 'code'].filter(Boolean).join('-')}.kishore.app`;

/**
 * A Worker's URL under `alchemy dev`, as Portless names it, with the branch
 * in front in a linked git worktree: the site's is the one Portless gave it
 * (its `portless.json` name, `code.kishore`), and the Machines Worker's the
 * one `pnpm dev` asked Portless for and aliased, `api-code.kishore`, handed
 * in as `MACHINES_URL`. ai-toolkit's `pnpm dev` asks Portless the same, so
 * a Machine finds this worktree's Backend.
 */
const devUrl = (api?: string) => {
  const url = api ? process.env.MACHINES_URL : process.env.PORTLESS_URL;
  if (url === undefined || url === '') {
    throw new Error(
      `${api ? 'MACHINES_URL' : 'PORTLESS_URL'} must be set by portless. Start the app with \`pnpm dev\`.`,
    );
  }
  return url;
};

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
    /** How the stage signs in: Local mode, or the Auth Worker at `url`. */
    auth: localAuth(dev)
      ? ({ local: true } as const)
      : {
          url: dev
            ? 'https://auth.kishore.computer'
            : 'https://auth.kishore.app',
        },
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

/** The Machines Worker's port under `alchemy dev`, aliased by `pnpm dev` as `api-code.kishore` (with the branch in front in a worktree). */
export const MACHINES_DEV_PORT = 4591;
