import { existsSync } from 'node:fs';
import path from 'node:path';
import { Effect, Stream } from 'effect';
import {
  clearTelemetry,
  queryLogs,
  queryMetrics,
  queryTraces,
} from '@kishorez/lotel';
import { discoverStoryIds, runAllStories, runStory } from 'laymos/node';
import { resolvePath } from '../report/assemble.js';
import { DevtoolsRpc, DevtoolsRpcError } from '../rpc/index.js';
import { runDepcruiseStream } from './depcruise.js';
import { getTrace } from './get-trace/index.js';
import { runLaymosStream } from './laymos.js';

const toRpcError = (cause: unknown): DevtoolsRpcError =>
  cause instanceof DevtoolsRpcError
    ? cause
    : new DevtoolsRpcError({ message: String(cause) });

const laymosOperation = <A, E, R>(operation: Effect.Effect<A, E, R>) =>
  operation.pipe(Effect.mapError(toRpcError));

/**
 * Live handlers for the {@link DevtoolsRpc} group. The telemetry read
 * procedures call lotel's orchestration and therefore require the lotel `Db`,
 * which is provided by the server entrypoint.
 */
export const DevtoolsHandlersLive = DevtoolsRpc.toLayer({
  RunDepcruise: ({ path: input }) => {
    const dir = resolvePath(input);
    return existsSync(path.join(dir, 'depcruise.config.ts'))
      ? runDepcruiseStream(dir)
      : Stream.make({
          _tag: 'Result' as const,
          result: { available: false as const },
        });
  },
  RunLaymos: ({ path: input }) => {
    const dir = resolvePath(input);
    return existsSync(path.join(dir, 'laymos.config.ts'))
      ? runLaymosStream(dir)
      : Stream.make({
          _tag: 'Result' as const,
          result: { available: false as const },
        });
  },
  RunAllStories: ({ path: input }) =>
    laymosOperation(runAllStories(resolvePath(input))),
  RunStory: ({ path: input, storyId }) =>
    laymosOperation(runStory(resolvePath(input), storyId)),
  DiscoverStoryIds: ({ path: input }) =>
    laymosOperation(discoverStoryIds(resolvePath(input))),
  QueryTraces: ({ sk, limit }) =>
    queryTraces(sk, limit).pipe(Effect.mapError(toRpcError)),
  GetTrace: ({ traceId }) =>
    getTrace(traceId).pipe(
      Effect.mapError((cause) =>
        cause._tag === 'TraceNotFound' ? cause : toRpcError(cause),
      ),
    ),
  QueryLogs: ({ sk, limit }) =>
    queryLogs(sk, limit).pipe(Effect.mapError(toRpcError)),
  QueryMetrics: ({ sk, limit }) =>
    queryMetrics(sk, limit).pipe(Effect.mapError(toRpcError)),
  ClearTelemetry: () =>
    clearTelemetry.pipe(
      Effect.map((deleted) => ({ deleted })),
      Effect.mapError(toRpcError),
    ),
});
