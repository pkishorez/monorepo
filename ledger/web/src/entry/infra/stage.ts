import { Match } from 'effect';

const isProdStage = (stage: string): boolean => stage === 'prod';
const isPrStage = (stage: string): boolean => /^pr\d+$/.test(stage);

export const isDeployedStage = (stage: string): boolean =>
  isProdStage(stage) || isPrStage(stage);

export const assertStageIsSafe = (stage: string): void => {
  if (isDeployedStage(stage) && process.env.ALLOW_DEPLOY !== 'true') {
    throw new Error(
      `Refusing to target deployed stage "${stage}" without ALLOW_DEPLOY=true. ` +
        `Deploys go through deploy-kstack.yml or \`pnpm deploy:prod\`.`,
    );
  }
};

export const domainFor = (stage: string): string | undefined =>
  Match.value(stage).pipe(
    Match.when(isProdStage, () => 'kstack.kishore.app'),
    Match.when(isDeployedStage, (s) => `${s}-kstack.kishore.app`),
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
