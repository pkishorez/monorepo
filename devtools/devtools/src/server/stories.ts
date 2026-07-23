import { Effect, Ref, Stream } from 'effect';
import { discoverStories, runStories } from 'laymos/node';
import { DevtoolsRpcError, type StoriesEvent } from '../rpc/index.js';

const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** Run selected Stories sequentially while reporting liveness and per-Story state. */
export const runStoriesStream = (
  dir: string,
  modulePath?: string,
): Stream.Stream<StoriesEvent, DevtoolsRpcError> => {
  const startedAt = Date.now();
  const events = Stream.unwrap(
    Effect.gen(function* () {
      const catalog = yield* discoverStories({ projectDir: dir });
      const module =
        modulePath === undefined
          ? undefined
          : catalog.modules.find(
              (catalogModule) => catalogModule.modulePath === modulePath,
            );
      if (modulePath !== undefined && module === undefined) {
        return yield* Effect.fail(
          new Error(`Story Module "${modulePath}" was not found`),
        );
      }
      const storyPaths = (
        module === undefined
          ? catalog.modules.flatMap(({ stories }) => stories)
          : module.stories
      ).map(({ storyPath }) => storyPath);
      const activeStory = yield* Ref.make<string | undefined>(undefined);
      const failed = yield* Ref.make(false);

      const storyStreams = storyPaths.map((storyPath) =>
        Stream.concat(
          Stream.fromEffect(
            Ref.set(activeStory, storyPath).pipe(
              Effect.as({ _tag: 'StoryStarted' as const, storyPath }),
            ),
          ),
          Stream.fromEffect(
            runStories({
              projectDir: dir,
              selectors: [{ _tag: 'Story', storyPath }],
            }).pipe(
              Effect.matchEffect({
                onFailure: (cause): Effect.Effect<StoriesEvent> =>
                  Ref.set(failed, true).pipe(
                    Effect.as({
                      _tag: 'StoryError' as const,
                      storyPath,
                      message: errorMessage(cause),
                    }),
                  ),
                onSuccess: (result): Effect.Effect<StoriesEvent> => {
                  const run = result.runs.stories[storyPath];
                  if (run === undefined) {
                    return Ref.set(failed, true).pipe(
                      Effect.as({
                        _tag: 'StoryError' as const,
                        storyPath,
                        message: `Story "${storyPath}" did not run`,
                      }),
                    );
                  }
                  return (
                    result.status === 'failed'
                      ? Ref.set(failed, true)
                      : Effect.void
                  ).pipe(
                    Effect.as({
                      _tag: 'StoryResult' as const,
                      storyPath,
                      result: {
                        status: result.status,
                        run,
                        failures: result.failures,
                      },
                    }),
                  );
                },
              }),
            ),
          ),
        ),
      );
      const storyEvents = storyStreams.reduce(
        (all, story) => Stream.concat(all, story),
        Stream.empty as Stream.Stream<StoriesEvent, never>,
      );
      const result = Stream.fromEffect(
        Ref.get(failed).pipe(
          Effect.map(
            (hasFailed) =>
              ({
                _tag: 'Result',
                status: hasFailed ? 'failed' : 'passed',
              }) as const,
          ),
        ),
      );
      const run = Stream.concat(storyEvents, result);
      const heartbeats = Stream.tick('1 second').pipe(
        Stream.mapEffect(() =>
          Ref.get(activeStory).pipe(
            Effect.map((storyPath) => ({
              _tag: 'Heartbeat' as const,
              elapsedMs: Date.now() - startedAt,
              ...(storyPath === undefined ? {} : { storyPath }),
            })),
          ),
        ),
      );

      return Stream.merge(run, heartbeats, { haltStrategy: 'left' });
    }).pipe(
      Effect.mapError(
        (cause) => new DevtoolsRpcError({ message: errorMessage(cause) }),
      ),
    ),
  );

  return events;
};
