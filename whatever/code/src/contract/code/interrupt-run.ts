import { Schema } from 'effect';
import { Rpc } from 'effect/unstable/rpc';
import { id } from 'std-toolkit/eschema';
import { CodeRpcError } from './code-rpc-error.js';

export const InterruptRunRpc = Rpc.make('interruptRun', {
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
