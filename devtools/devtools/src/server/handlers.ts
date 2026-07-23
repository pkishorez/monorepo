import { existsSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { Effect, Stream } from 'effect';
import {
  clearTelemetry,
  queryLogs,
  queryMetrics,
  queryTraces,
} from '@pkishorez/lotel';
import { getStories, projectStorySource, runStory } from 'laymos/node';
import { resolvePath } from '../report/assemble.js';
import { DevtoolsRpc, DevtoolsRpcError } from '../rpc/index.js';
import { getTrace } from './get-trace/index.js';
import { bootstrapLaymosProjectStream, runLaymosStream } from './laymos.js';
import { runStoriesStream } from './stories.js';

const toRpcError = (cause: unknown): DevtoolsRpcError =>
  cause instanceof DevtoolsRpcError
    ? cause
    : new DevtoolsRpcError({ message: String(cause) });

const laymosOperation = <A, E, R>(operation: Effect.Effect<A, E, R>) =>
  operation.pipe(Effect.mapError(toRpcError));

const readProjectFile = (projectPath: string, filePath: string) =>
  Effect.tryPromise({
    try: async () => {
      if (path.isAbsolute(filePath))
        throw new Error('File path must be relative');
      const root = await realpath(resolvePath(projectPath));
      const file = await realpath(path.resolve(root, filePath));
      const relative = path.relative(root, file);
      if (
        relative === '' ||
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      ) {
        throw new Error('File is outside the selected project');
      }
      const info = await stat(file);
      if (!info.isFile()) throw new Error('Path is not a regular file');
      const content = await readFile(file, 'utf8');
      if (content.includes('\0')) throw new Error('File is not text');
      return { filePath: relative.split(path.sep).join('/'), content };
    },
    catch: toRpcError,
  });

/**
 * Live handlers for the {@link DevtoolsRpc} group. The telemetry read
 * procedures call lotel's orchestration and therefore require the lotel `Db`,
 * which is provided by the server entrypoint.
 */
export const DevtoolsHandlersLive = DevtoolsRpc.toLayer({
  BootstrapLaymosProject: ({ path: input }) => {
    const dir = resolvePath(input);
    return existsSync(path.join(dir, 'laymos.config.ts'))
      ? bootstrapLaymosProjectStream(dir)
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
  RunAllStories: ({ path: input }) => runStoriesStream(resolvePath(input)),
  RunStory: ({ path: input, storyId }) =>
    laymosOperation(runStory(resolvePath(input), storyId)),
  RunStoryGroup: ({ path: input, groupPath }) =>
    runStoriesStream(resolvePath(input), groupPath),
  GetStories: ({ path: input }) =>
    laymosOperation(getStories(resolvePath(input))),
  ReadProjectFile: ({ path: input, filePath }) =>
    readProjectFile(input, filePath),
  ReadStorySource: ({ path: input, filePath, anchors }) =>
    readProjectFile(input, filePath).pipe(
      Effect.flatMap(({ filePath: resolvedFilePath, content }) =>
        Effect.try({
          try: () => ({
            filePath: resolvedFilePath,
            source: content,
            ...projectStorySource(
              content,
              resolvedFilePath,
              anchors.map(({ id, line, column, classification, reason }) => ({
                id,
                line,
                column,
                ...(classification === undefined ? {} : { classification }),
                ...(reason === undefined ? {} : { reason }),
              })),
            ),
          }),
          catch: toRpcError,
        }),
      ),
    ),
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
