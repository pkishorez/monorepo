import { AlchemyContext, Stage } from 'alchemy';
import * as Effect from 'effect/Effect';

/*
 * A deploy's Stage, as alchemy names it: `prod`, `demo`, a pull request's
 * `prN`, or anyone's own on their machine. Only the first three reach the
 * world, and only when the deploy says so on purpose, as CI and a
 * `deploy:prod` script do with ALLOW_DEPLOY=true.
 */

const isProdStage = (stage: string): boolean => stage === 'prod';

/** Whether a Stage reaches the world: `prod`, `demo` or `prN`. */
export const isDeployedStage = (stage: string): boolean =>
  isProdStage(stage) || stage === 'demo' || /^pr\d+$/.test(stage);

/** Refuses a deployed Stage unless the deploy says so with ALLOW_DEPLOY=true. */
export const assertStageIsSafe = (stage: string): void => {
  if (isDeployedStage(stage) && process.env['ALLOW_DEPLOY'] !== 'true') {
    throw new Error(
      `Refusing to target deployed stage "${stage}" without ALLOW_DEPLOY=true. ` +
        'Deploy with `pnpm deploy:prod` or the app’s deploy workflow.',
    );
  }
};

/** The port `portless run` gave `pnpm dev`, for the site under `alchemy dev`. */
export const portlessPort = (): number => {
  const port = Number(process.env['PORT']);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      'PORT must be assigned by portless. Start the app with `pnpm dev`.',
    );
  }
  return port;
};

/** Where an app is served when deployed: `code` on `kishore.app` is `code.kishore.app`. */
export interface Address {
  readonly host: string;
  readonly zone: string;
}

/** Where the Stage being run serves things. */
export interface Where {
  readonly stage: string;
  /** Under `alchemy dev`. */
  readonly dev: boolean;
  /**
   * A Worker's own domain on a deployed Stage, none elsewhere: the site's,
   * or with `api` an API Worker's beside it, as `pr12-api-code.kishore.app`.
   */
  readonly domain: (api?: string) => string | undefined;
  /**
   * A Worker's URL as the browser calls it, if it is known before it is
   * made: on a deployed Stage its domain's; under `alchemy dev` the site's
   * is the one Portless gave it, and an API Worker's is the app's to say.
   */
  readonly url: (api?: string) => string | undefined;
}

const deployedHost = (stage: string, address: Address, api?: string) =>
  `${[isProdStage(stage) ? undefined : stage, api, address.host].filter(Boolean).join('-')}.${address.zone}`;

const portlessUrl = (): string => {
  const url = process.env['PORTLESS_URL'];
  if (url === undefined || url === '') {
    throw new Error(
      'PORTLESS_URL must be set by portless. Start the app with `pnpm dev`.',
    );
  }
  return url;
};

/** Where the Stage being run serves things, once it is checked it may be run. */
export const where = (address: Address) =>
  Effect.gen(function* () {
    const stage = yield* Stage;
    const { dev } = yield* AlchemyContext;
    assertStageIsSafe(stage);
    const deployed = !dev && isDeployedStage(stage);
    return {
      stage,
      dev,
      domain: (api) =>
        deployed ? deployedHost(stage, address, api) : undefined,
      url: (api) =>
        dev
          ? api === undefined
            ? portlessUrl()
            : undefined
          : deployed
            ? `https://${deployedHost(stage, address, api)}`
            : undefined,
    } satisfies Where as Where;
  });
