import type { UIMessage } from '@tanstack/ai';
import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { fromType, id } from 'std-toolkit/eschema';
import {
  RunConfigurationInputSchema,
  RunStreamEventSchema,
} from './schemas.js';

export class CodeRpcError extends Schema.TaggedErrorClass<CodeRpcError>(
  'CodeRpcError',
)('CodeRpcError', {
  code: Schema.String,
  message: Schema.String,
}) {}

const StartThreadRpc = Rpc.make('startThread', {
  payload: {
    workingDirectory: Schema.String,
    configuration: RunConfigurationInputSchema,
    message: fromType<UIMessage>(),
  },
  success: RunStreamEventSchema,
  error: CodeRpcError,
  stream: true,
});

const StartRunRpc = Rpc.make('startRun', {
  payload: {
    threadId: id('ThreadId'),
    configuration: RunConfigurationInputSchema,
    message: fromType<UIMessage>(),
  },
  success: RunStreamEventSchema,
  error: CodeRpcError,
  stream: true,
});

const InterruptRunRpc = Rpc.make('interruptRun', {
  payload: {
    threadId: id('ThreadId'),
    runId: id('RunId'),
  },
  success: Schema.Struct({
    runId: id('RunId'),
    status: Schema.Literal('interrupted'),
  }),
  error: CodeRpcError,
});

export const CodeRpcs = RpcGroup.make(
  StartThreadRpc,
  StartRunRpc,
  InterruptRunRpc,
);
