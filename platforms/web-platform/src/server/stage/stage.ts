/**
 * A deploy's stage, as alchemy names it: `prod`, a pull request's `prN`, or
 * anyone's own stage on their machine. Only `prod` and `prN` reach the
 * world.
 */
const isProdStage = (stage: string): boolean => stage === 'prod';
const isPrStage = (stage: string): boolean => /^pr\d+$/.test(stage);

export const isDeployedStage = (stage: string): boolean =>
  isProdStage(stage) || isPrStage(stage);

/** Refuses a deployed stage unless the deploy says so on purpose, as CI and
 * a deploy script do with ALLOW_DEPLOY=true. */
export const assertStageIsSafe = (stage: string): void => {
  if (isDeployedStage(stage) && process.env['ALLOW_DEPLOY'] !== 'true') {
    throw new Error(
      `Refusing to target deployed stage "${stage}" without ALLOW_DEPLOY=true.`,
    );
  }
};

/** Where a stage is served: `domain` for prod, `prN-domain` for a pull
 * request, and nowhere public for anyone's own stage. */
export const domainFor = (stage: string, domain: string): string | undefined =>
  isProdStage(stage)
    ? domain
    : isDeployedStage(stage)
      ? `${stage}-${domain}`
      : undefined;

/** A local stage's dev server, on the PORT `portless run` hands it. */
export const devConfigFor = (
  isLocal: boolean,
): { port: number } | undefined => {
  if (!isLocal) return undefined;
  const port = Number(process.env['PORT']);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      'PORT must be assigned by portless. Start the app with `pnpm dev`.',
    );
  }
  return { port };
};
