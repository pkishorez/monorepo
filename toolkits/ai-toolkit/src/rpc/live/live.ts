import { Effect, Layer, Stream } from 'effect';
import {
  AgentHost,
  RunLog,
  type AgentHostConfig,
  type RunLogShape,
} from '../../harness/host/index.js';
import type {
  ClaudeEvent,
  CodexEvent,
  CommonEvent,
  RunChunk,
} from '../../harness/run-state/index.js';
import { AiRpc } from '../contract/index.js';

const handlers = AiRpc.toLayer({
  watchRun: ({ runId, after }) =>
    Stream.unwrap(Effect.map(RunLog, (log) => log.watchRun(runId, after))),
  watchThread: ({ threadId, after }) =>
    Stream.unwrap(
      Effect.map(RunLog, (log) => log.watchThread(threadId, after)),
    ),
  cancelRun: ({ runId, reason }) =>
    Effect.flatMap(AgentHost, (host) => host.cancel(runId, reason)),
  getThread: ({ threadId }) =>
    Effect.flatMap(AgentHost, (host) => host.getThread(threadId)),
  claudeStart: (input) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const host = yield* AgentHost;
        const log = yield* RunLog;
        yield* host.start({ ...input, harness: 'claude' });
        return log
          .watchRun(input.runId)
          .pipe(
            Stream.map((item) => item as RunChunk<CommonEvent | ClaudeEvent>),
          );
      }),
    ),
  claudeRespond: ({ runId, requestId, answer }) =>
    Effect.flatMap(AgentHost, (host) =>
      host.resolve('claude', runId, requestId, answer),
    ),
  codexStart: (input) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const host = yield* AgentHost;
        const log = yield* RunLog;
        yield* host.start({ ...input, harness: 'codex' });
        return log
          .watchRun(input.runId)
          .pipe(
            Stream.map((item) => item as RunChunk<CommonEvent | CodexEvent>),
          );
      }),
    ),
  codexRespond: ({ runId, requestId, answer }) =>
    Effect.flatMap(AgentHost, (host) =>
      host.resolve('codex', runId, requestId, answer),
    ),
});

export { AgentHost, RunLog };
export type { AgentHostConfig, RunLogShape };

export class AiRpcLive {
  static layer(config: AgentHostConfig) {
    return handlers.pipe(Layer.provide(AgentHost.layer(config)));
  }

  static memory(config: AgentHostConfig) {
    return AiRpcLive.layer(config).pipe(Layer.provide(RunLog.memory));
  }

  static runLog(implementation: RunLogShape) {
    return Layer.succeed(RunLog, implementation);
  }
}
