import type { UIMessage } from '@tanstack/ai';
import { Schema } from 'effect';
import { Rpc } from 'effect/unstable/rpc';
import { fromType } from 'std-toolkit/eschema';
import { CodeRpcError } from './code-rpc-error.js';
import { RunConfigurationInputSchema } from './run-configuration.js';
import { RunStreamEventSchema } from './run-stream-event.js';

export const StartThreadRpc = Rpc.make('startThread', {
  payload: {
    workingDirectory: Schema.String,
    configuration: RunConfigurationInputSchema,
    message: fromType<UIMessage>(),
  },
  success: RunStreamEventSchema,
  error: CodeRpcError,
  stream: true,
});
