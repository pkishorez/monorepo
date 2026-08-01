import type { Run } from './schema/index.js';

export interface RunOutcome {
  interrupted: boolean;
  runError: { code: string | null; message: string } | null;
  finishReason: string | null;
}

const FINISH_REASONS = [
  'stop',
  'length',
  'content_filter',
  'tool_calls',
] as const;

export const deriveRunTerminal = (
  outcome: RunOutcome,
): Pick<Run, 'status' | 'terminalDetails'> => {
  if (outcome.interrupted) {
    return {
      status: 'interrupted',
      terminalDetails: {
        _tag: 'Interrupted',
        code: 'user_interrupt',
        message: 'Run interrupted by user',
      },
    };
  }
  if (outcome.runError) {
    return {
      status: 'failed',
      terminalDetails: {
        _tag: 'Failed',
        code: outcome.runError.code,
        message: outcome.runError.message,
      },
    };
  }
  return {
    status: 'completed',
    terminalDetails: {
      _tag: 'Completed',
      finishReason:
        FINISH_REASONS.find((known) => known === outcome.finishReason) ?? null,
    },
  };
};
