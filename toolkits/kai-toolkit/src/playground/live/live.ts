import { Effect } from 'effect';
import { THREAD_CWD } from '../../runtime/constants.js';
import { threads } from '../../runtime/table/index.js';
import { AiPlaygroundRpc, PlaygroundFailed } from '../contract/index.js';
import { watchMessages, watchThreads } from './subscriptions.js';

export const AiPlaygroundRpcLive = AiPlaygroundRpc.toLayer({
  createThread: ({ id, harness }) =>
    threads
      .insert({
        id,
        harness,
        cwd: THREAD_CWD,
        status: 'idle',
        activeRunId: null,
        data:
          harness === 'claude'
            ? { type: 'claude', sessionId: null }
            : { type: 'codex', threadId: null },
      })
      .pipe(
        Effect.mapError(
          (error) => new PlaygroundFailed({ message: error.message }),
        ),
      ),
  subscribeThreads: ({ '>': cursor }) => watchThreads(cursor),
  subscribeMessages: ({ threadId, '>': cursor }) =>
    watchMessages(threadId, cursor),
});
