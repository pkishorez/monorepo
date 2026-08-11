import { Effect } from 'effect';

export type FlowLogLevel = 'debug' | 'error' | 'info' | 'warning';

const loggerByLevel = {
  debug: Effect.logDebug,
  error: Effect.logError,
  info: Effect.logInfo,
  warning: Effect.logWarning,
};

export const writeFlowLog = (
  level: FlowLogLevel,
  message: unknown,
  attributes: Readonly<Record<string, unknown>>,
) => loggerByLevel[level](message).pipe(Effect.annotateLogs({ ...attributes }));
