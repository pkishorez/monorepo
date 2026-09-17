import { Effect, Layer } from 'effect';
import type { StdTableService } from 'std-toolkit/db';
import {
  HarnessHost,
  type HarnessHostConfig,
} from '../../runtime/host/index.js';
import { AiRpc } from '../contract/index.js';

const handlers = AiRpc.toLayer({
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
  codexStart: (input) =>
    Effect.flatMap(HarnessHost, (host) =>
      host.start({ ...input, harness: 'codex' }),
    ),
  codexRespond: ({ runId, requestId, answer }) =>
    Effect.flatMap(HarnessHost, (host) =>
      host.resolveCodex(runId, requestId, answer),
    ),
});

export { HarnessHost };
export type { HarnessHostConfig };

/** Server-side handlers. The consumer supplies the AI Table's StdTable service. */
export class AiRpcLive {
  static layer(
    config: HarnessHostConfig = {},
  ): Layer.Layer<
    Layer.Success<typeof handlers>,
    never,
    StdTableService<'ai-toolkit'>
  > {
    return handlers.pipe(Layer.provide(HarnessHost.layer(config)));
  }
}
