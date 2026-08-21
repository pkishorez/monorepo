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

export const devConfigFor = (isLocal: boolean): { port: number } | undefined =>
  isLocal ? { port: 3000 } : undefined;
