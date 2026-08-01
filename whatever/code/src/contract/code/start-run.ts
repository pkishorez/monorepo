import type { UIMessage } from '@tanstack/ai';
import { Rpc } from 'effect/unstable/rpc';
import { fromType, id } from 'std-toolkit/eschema';
import { CodeRpcError } from './code-rpc-error.js';
import { RunConfigurationInputSchema } from './run-configuration.js';
import { RunStreamEventSchema } from './run-stream-event.js';

export const StartRunRpc = Rpc.make('startRun', {
  payload: {
    threadId: id('ThreadId'),
    configuration: RunConfigurationInputSchema,
    message: fromType<UIMessage>(),
  },
  success: RunStreamEventSchema,
  error: CodeRpcError,
  stream: true,
});
