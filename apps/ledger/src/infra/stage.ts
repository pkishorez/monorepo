import { domainFor as domainOn } from '@kstackz/web-platform/server';

export {
  assertStageIsSafe,
  devConfigFor,
  isDeployedStage,
} from '@kstackz/web-platform/server';

/** Where Ledger is served on a stage: kstack.kishore.app, or prN- of it. */
export const domainFor = (stage: string): string | undefined =>
  domainOn(stage, 'kstack.kishore.app');
