import { fork } from 'node:child_process';
import { Cause, Effect, Queue, Stream } from 'effect';
import {
  analyzeProject,
  discoverTests,
  getProjectNarrative,
  inspectStories,
  measureStoryCoverage,
} from 'laymos/node';
import type {
  LaymosReport,
  StoryCollection,
  StoryCoverageReport,
  ProjectNarrative,
  TestCatalog,
} from 'laymos/report';
import {
  DevtoolsRpcError,
  type LaymosProjectDocumentation,
  type OpenLaymosProjectEvent,
} from '../rpc/index.js';

/** Selects the one-shot laymos worker mode in the bundled server entrypoint. */
export const LAYMOS_DIR_ENV = 'DEVTOOLS_LAYMOS_DIR';

type WorkerMessage =
  | { type: 'project'; project?: ProjectNarrative }
  | { type: 'architecture'; architecture: LaymosReport }
  | { type: 'stories'; stories: StoryCollection }
  | { type: 'storyCoverage'; storyCoverage: StoryCoverageReport }
  | { type: 'tests'; tests: TestCatalog }
  | {
      type: 'result';
      architecture: LaymosReport;
      bootstrap?: {
        stories: StoryCollection;
        storyCoverage: StoryCoverageReport;
        tests: TestCatalog;
        documentation: LaymosProjectDocumentation;
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

  const architectureEffect = analyzeProject({ projectDir: dir }).pipe(
    Effect.tap((architecture) =>
      Effect.sync(() => post({ type: 'architecture', architecture })),
    ),
  );
  const projectEffect = getProjectNarrative({ projectDir: dir }).pipe(
    Effect.tap((project) =>
      Effect.sync(() =>
        post({
          type: 'project',
          ...(project === undefined ? {} : { project }),
        }),
      ),
    ),
  );
  const storiesEffect = inspectStories({ projectDir: dir }).pipe(
    Effect.tap((stories) =>
      Effect.sync(() => post({ type: 'stories', stories })),
    ),
  );
  const storiesWithCoverageEffect = storiesEffect.pipe(
    Effect.flatMap((stories) =>
      measureStoryCoverage({ projectDir: dir, stories }).pipe(
        Effect.tap((storyCoverage) =>
          Effect.sync(() => post({ type: 'storyCoverage', storyCoverage })),
        ),
        Effect.map((storyCoverage) => ({ stories, storyCoverage })),
      ),
    ),
  );
  const testsEffect = discoverTests({ projectDir: dir }).pipe(
    Effect.tap((tests) => Effect.sync(() => post({ type: 'tests', tests }))),
  );
  const operation = Effect.all(
    [projectEffect, architectureEffect, storiesWithCoverageEffect, testsEffect],
    { concurrency: 'unbounded' },
  ).pipe(
    Effect.map(([, architecture, { stories, storyCoverage }, tests]) => ({
      architecture,
      bootstrap: {
        stories,
        storyCoverage,
        tests,
        documentation: projectDocumentation(architecture, stories),
        files: projectFiles(architecture, stories),
      },
    })),
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
          if (message.type === 'architecture') {
            Queue.offerUnsafe(queue, {
              _tag: 'Architecture',
              architecture: message.architecture,
            });
            return;
          }
          if (message.type === 'project') {
            Queue.offerUnsafe(queue, {
              _tag: 'Project',
              ...(message.project === undefined
                ? {}
                : { project: message.project }),
            });
            return;
          }
          if (message.type === 'stories') {
            Queue.offerUnsafe(queue, {
              _tag: 'Stories',
              stories: message.stories,
            });
            return;
          }
          if (message.type === 'storyCoverage') {
            Queue.offerUnsafe(queue, {
              _tag: 'StoryCoverage',
              storyCoverage: message.storyCoverage,
            });
            return;
          }
          if (message.type === 'tests') {
            Queue.offerUnsafe(queue, {
              _tag: 'Tests',
              tests: message.tests,
            });
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
                tests: message.bootstrap.tests,
                documentation: message.bootstrap.documentation,
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

function projectDocumentation(
  architecture: LaymosReport,
  stories: StoryCollection,
): LaymosProjectDocumentation {
  return {
    modules: Object.entries(architecture.architecture.modules)
      .map(([modulePath, module]) => ({
        modulePath,
        description: module.description ?? '',
        ...(module.documentation === undefined
          ? {}
          : { documentation: module.documentation }),
      }))
      .sort((left, right) => left.modulePath.localeCompare(right.modulePath)),
    stories: stories.catalog.modules
      .flatMap((module) =>
        module.stories.map((story) => ({
          storyPath: story.storyPath,
          modulePath: story.modulePath,
          name: story.name,
          description: story.description,
          ...(story.documentation === undefined
            ? {}
            : { documentation: story.documentation }),
        })),
      )
      .sort((left, right) => left.storyPath.localeCompare(right.storyPath)),
  };
}
