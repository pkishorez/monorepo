import { Match } from 'effect';

const isProdStage = (stage: string): boolean => stage === 'prod';
const isDemoStage = (stage: string): boolean => stage === 'demo';
const isPrStage = (stage: string): boolean => /^pr\d+$/.test(stage);

export const isDeployedStage = (stage: string): boolean =>
  isProdStage(stage) || isDemoStage(stage) || isPrStage(stage);

export const assertStageIsSafe = (stage: string): void => {
  if (isDeployedStage(stage) && process.env.ALLOW_DEPLOY !== 'true') {
    throw new Error(
      `Refusing to target deployed stage "${stage}" without ALLOW_DEPLOY=true. ` +
        `Deploys go through deploy.yml or \`pnpm deploy:prod\`.`,
    );
  }
};

export const domainFor = (stage: string): string | undefined =>
  Match.value(stage).pipe(
    Match.when(isProdStage, () => 'docs.kishore.app'),
    Match.when(isDeployedStage, (s) => `${s}-docs.kishore.app`),
    Match.orElse(() => undefined),
  );

// Honor the PORT injected by `portless run` (see the "dev" script).
export const devConfigFor = (
  isLocal: boolean,
): { port: number } | undefined => {
  if (!isLocal) return undefined;
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      'PORT must be assigned by portless. Start the app with `pnpm dev`.',
    );
  }
  return { port };
};
