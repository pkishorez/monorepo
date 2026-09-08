export const productionHost = '__PRODUCTION_HOST__';

const isProdStage = (stage: string): boolean => stage === 'prod';
const isPrStage = (stage: string): boolean => /^pr\d+$/.test(stage);

export const isDeployedStage = (stage: string): boolean =>
  isProdStage(stage) || isPrStage(stage);

// Deployed stages reconcile only through GitHub Actions or `pnpm deploy:prod`.
export const assertStageIsSafe = (stage: string): void => {
  if (isDeployedStage(stage) && process.env.ALLOW_DEPLOY !== 'true') {
    throw new Error(
      `Refusing to target deployed stage "${stage}" without ALLOW_DEPLOY=true.`,
    );
  }
};

export const domainFor = (stage: string): string | undefined => {
  if (isProdStage(stage)) return productionHost;
  if (isDeployedStage(stage)) return `${stage}-${productionHost}`;
  return undefined;
};

// Honor the PORT injected by `portless run` (see the "dev" script).
export const devConfigFor = (stage: string): { port: number } | undefined => {
  if (isDeployedStage(stage)) return undefined;
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      'PORT must be assigned by Portless. Start the app with `pnpm dev`.',
    );
  }
  return { port };
};
