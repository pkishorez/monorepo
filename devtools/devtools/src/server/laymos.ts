import { fork } from 'node:child_process';
import { Cause, Effect, Queue, Stream } from 'effect';
import { NodeServices } from '@effect/platform-node';
import { analyzeProject, getStories, getStoryCoverage } from 'laymos/node';
import type {
  LaymosReport,
  StoryCollection,
  StoryCoverageReport,
} from 'laymos/report';
import { DevtoolsRpcError, type OpenLaymosProjectEvent } from '../rpc/index.js';

/** Selects the one-shot laymos worker mode in the bundled server entrypoint. */
export const LAYMOS_DIR_ENV = 'DEVTOOLS_LAYMOS_DIR';

type WorkerMessage =
  | {
      type: 'result';
      architecture: LaymosReport;
      bootstrap?: {
        stories: StoryCollection;
        storyCoverage: StoryCoverageReport;
        files: readonly string[];
      };
    }
  | { type: 'error'; message: string };

const errorMessage = (cause: unknown): string => {
  if (
    typeof cause === 'object' &&
    cause !== null &&
    'cause' in cause &&
    cause.cause !== undefined
  ) {
    return errorMessage(cause.cause);
  }
  return cause instanceof Error ? cause.message : String(cause);
};

/** Run laymos once and send its report to the parent process. */
export const runLaymosWorker = (dir: string) => {
  const post = (message: WorkerMessage, onFlushed?: () => void) => {
    if (process.send) {
      process.send(message, undefined, undefined, onFlushed);
    } else {
      onFlushed?.();
    }
  };

  const operation = Effect.all([analyzeProject(dir), getStories(dir)], {
    concurrency: 'unbounded',
  }).pipe(
    Effect.flatMap(([architecture, stories]) =>
      getStoryCoverage(dir, stories).pipe(
        Effect.map((storyCoverage) => ({
          architecture,
          bootstrap: {
            stories,
            storyCoverage,
            files: projectFiles(architecture, stories),
          },
        })),
      ),
    ),
    Effect.provide(NodeServices.layer),
  );

  void Effect.runPromise(operation)
    .then((result) => {
      post(
        {
          type: 'result',
          ...result,
        },
        () => process.exit(0),
      );
    })
    .catch((cause: unknown) => {
      post({ type: 'error', message: errorMessage(cause) }, () =>
        process.exit(1),
      );
    });
};

/** Open architecture and Story definitions as one coherent project model. */
export const openLaymosProjectStream = (
  dir: string,
): Stream.Stream<OpenLaymosProjectEvent, DevtoolsRpcError> =>
  Stream.callback<OpenLaymosProjectEvent, DevtoolsRpcError>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const startedAt = Date.now();
        const fail = (message: string) =>
          Queue.failCauseUnsafe(
            queue,
            Cause.fail(new DevtoolsRpcError({ message })),
          );
        const child = fork(process.argv[1] as string, [], {
          env: {
            ...process.env,
            [LAYMOS_DIR_ENV]: dir,
          },
        });
        let settled = false;
        const heartbeat = setInterval(() => {
          Queue.offerUnsafe(queue, {
            _tag: 'Heartbeat',
            elapsedMs: Date.now() - startedAt,
          });
        }, 1000);
        child.on('message', (message: WorkerMessage) => {
          if (message.type === 'error') {
            settled = true;
            fail(message.message);
            return;
          }
          if (message.bootstrap === undefined) {
            settled = true;
            fail('laymos bootstrap worker exited without Story definitions');
            return;
          }
          settled = true;
          Queue.offerUnsafe(queue, {
            _tag: 'Result',
            result: {
              available: true,
              data: {
                architecture: message.architecture,
                stories: message.bootstrap.stories,
                storyCoverage: message.bootstrap.storyCoverage,
                files: [...message.bootstrap.files],
              },
            },
          });
          Queue.endUnsafe(queue);
        });
        child.on('error', (cause: Error) => {
          settled = true;
          fail(cause.message);
        });
        child.on('exit', (code) => {
          if (settled) return;
          fail(
            code === 0
              ? 'laymos worker exited without a result'
              : `laymos worker exited with code ${code}`,
          );
        });
        return { child, heartbeat };
      }),
      ({ child, heartbeat }) =>
        Effect.sync(() => {
          clearInterval(heartbeat);
          child.kill();
        }),
    ),
  );

function projectFiles(
  architecture: LaymosReport,
  stories: StoryCollection,
): readonly string[] {
  const files = new Set(Object.keys(architecture.files));
  for (const trace of Object.values(stories.traces)) {
    for (const block of Object.values(trace.blocks)) {
      const file = block.location.file;
      if (
        file !== '' &&
        file !== '..' &&
        !file.startsWith('../') &&
        !file.startsWith('/')
      ) {
        files.add(file);
      }
    }
  }
  return [...files].sort();
}
