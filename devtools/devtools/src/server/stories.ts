import { Effect, Ref, Stream } from 'effect';
import { discoverStories, runStory } from 'laymos/node';
import { DevtoolsRpcError, type StoriesEvent } from '../rpc/index.js';

const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** Run every Story sequentially while reporting liveness and per-Story state. */
export const runStoriesStream = (
  dir: string,
  groupPath?: readonly string[],
): Stream.Stream<StoriesEvent, DevtoolsRpcError> => {
  const startedAt = Date.now();
  const events = Stream.unwrap(
    Effect.gen(function* () {
      const catalog = yield* discoverStories(dir);
      if (
        groupPath !== undefined &&
        !catalog.groups.some(({ path }) => samePath(path, groupPath))
      ) {
        return yield* Effect.fail(
          new Error(`Story Group "${groupPath.join(' / ')}" was not found`),
        );
      }
      const storyIds = catalog.stories
        .filter(
          ({ groupPath: storyGroupPath }) =>
            groupPath === undefined ||
            startsWithPath(storyGroupPath, groupPath),
        )
        .map(({ storyId }) => storyId);
      const activeStory = yield* Ref.make<string | undefined>(undefined);
      const failed = yield* Ref.make(false);

      const storyStreams = storyIds.map((storyId) =>
        Stream.concat(
          Stream.fromEffect(
            Ref.set(activeStory, storyId).pipe(
              Effect.as({ _tag: 'StoryStarted' as const, storyId }),
            ),
          ),
          Stream.fromEffect(
            runStory(dir, storyId).pipe(
              Effect.matchEffect({
                onFailure: (cause): Effect.Effect<StoriesEvent> =>
                  Ref.set(failed, true).pipe(
                    Effect.as({
                      _tag: 'StoryError' as const,
                      storyId,
                      message: errorMessage(cause),
                    }),
                  ),
                onSuccess: (result): Effect.Effect<StoriesEvent> =>
                  (result.status === 'failed'
                    ? Ref.set(failed, true)
                    : Effect.void
                  ).pipe(
                    Effect.as({
                      _tag: 'StoryResult' as const,
                      storyId,
                      result,
                    }),
                  ),
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
            Effect.map((storyId) => ({
              _tag: 'Heartbeat' as const,
              elapsedMs: Date.now() - startedAt,
              ...(storyId === undefined ? {} : { storyId }),
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

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((segment, index) => segment === right[index])
  );
}

function startsWithPath(
  path: readonly string[],
  prefix: readonly string[],
): boolean {
  return prefix.every((segment, index) => path[index] === segment);
}
