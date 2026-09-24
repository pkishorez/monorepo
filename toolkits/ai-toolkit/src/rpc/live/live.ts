import { Effect, Layer } from 'effect';
import type { StdTableService } from 'std-toolkit/db';
import { Claude } from '../../runtime/harnesses/claude/index.js';
import { Codex } from '../../runtime/harnesses/codex/index.js';
import { common } from '../../runtime/protocol/index.js';
import {
  HarnessHost,
  type HarnessHostConfig,
} from '../../runtime/host/index.js';
import { AiRpc } from '../contract/index.js';

const { HarnessFailed } = common.errors;

const failed = (harness: 'claude' | 'codex') => (cause: unknown) =>
  new HarnessFailed({
    harness,
    message: cause instanceof Error ? cause.message : String(cause),
  });

const handlers = (config: HarnessHostConfig) =>
  AiRpc.toLayer({
    cancelRun: ({ runId, reason }) =>
      Effect.flatMap(HarnessHost, (host) => host.cancel(runId, reason)),
    claudeStart: (input) =>
      Effect.flatMap(HarnessHost, (host) =>
        host.start({ ...input, harness: 'claude' }),
      ),
    claudeRespond: ({ runId, requestId, answer }) =>
      Effect.flatMap(HarnessHost, (host) =>
        host.resolveClaude(runId, requestId, answer),
      ),
    claudeGetAccountUsage: () =>
      Effect.tryPromise({
        try: () => Claude.accountUsage(),
        catch: failed('claude'),
      }),
    codexStart: (input) =>
      Effect.flatMap(HarnessHost, (host) =>
        host.start({ ...input, harness: 'codex' }),
      ),
    codexRespond: ({ runId, requestId, answer }) =>
      Effect.flatMap(HarnessHost, (host) =>
        host.resolveCodex(runId, requestId, answer),
      ),
    codexGetAccountUsage: () =>
      Effect.tryPromise({
        try: () => Codex.accountUsage(config.codexCommand),
        catch: failed('codex'),
      }),
  });

export { HarnessHost };
export type { HarnessHostConfig };

/** Server-side handlers. The consumer supplies the AI Table's StdTable service. */
export class AiRpcLive {
  static layer(
    config: HarnessHostConfig = {},
  ): Layer.Layer<
    Layer.Success<ReturnType<typeof handlers>>,
    never,
    StdTableService<'ai-toolkit'>
  > {
    return handlers(config).pipe(Layer.provide(HarnessHost.layer(config)));
  }
}
