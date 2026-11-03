import { Effect, Option, Stream, SubscriptionRef } from 'effect';
import { HarnessError, type BackgroundJob } from '../../../contract/index.js';
import { next, type Links } from './job-list.js';
import { followFile, outputFilesOf } from './output.js';

export interface BackgroundJobs {
  /** Reads one record the query yielded. */
  readonly observe: (
    record: Readonly<Record<string, unknown>>,
  ) => Effect.Effect<void>;
  /** The current list first, then each change. */
  readonly changes: Stream.Stream<ReadonlyArray<BackgroundJob>>;
  readonly stop: (id: string) => Effect.Effect<void, HarnessError>;
  /** What a background command writes, from the file Claude Code writes it to. */
  readonly output: (id: string) => Stream.Stream<string>;
  /** Empties the list, as when Claude Code has exited. */
  readonly clear: Effect.Effect<void>;
}

/** How often a command's file is looked for, before its tool result names it. */
const LOOK_EVERY = '250 millis';

/**
 * The agent's Background Jobs, kept from the task records the query yields.
 * `stopTask` asks Claude Code to stop one; the list drops it once Claude
 * Code reports it stopped. A background command's output is read from the
 * file its tool result names.
 */
export const makeBackgroundJobs = (
  stopTask: (id: string) => Promise<void>,
): Effect.Effect<BackgroundJobs> =>
  Effect.gen(function* () {
    const jobs = yield* SubscriptionRef.make<ReadonlyArray<BackgroundJob>>([]);
    const links: Links = new Map();
    const files = new Map<string, string>();

    const listed = (id: string) =>
      Effect.map(SubscriptionRef.get(jobs), (list) =>
        list.find((job) => job.id === id),
      );

    /** Waits until the job is no longer listed. */
    const ended = (id: string) =>
      SubscriptionRef.changes(jobs).pipe(
        Stream.filter((list) => !list.some((job) => job.id === id)),
        Stream.runHead,
        Effect.asVoid,
      );

    /** The command's file, once its tool result names it; none once it is gone. */
    const fileOf = (id: string): Effect.Effect<Option.Option<string>> =>
      Effect.suspend(() => {
        const path = files.get(id);
        if (path !== undefined) return Effect.succeed(Option.some(path));
        return Effect.flatMap(listed(id), (job) =>
          job === undefined
            ? Effect.succeed(Option.none())
            : Effect.andThen(Effect.sleep(LOOK_EVERY), fileOf(id)),
        );
      });

    return {
      observe: (record) =>
        Effect.andThen(
          Effect.sync(() => {
            for (const [taskId, path] of outputFilesOf(record))
              files.set(taskId, path);
            if (
              record['type'] === 'system' &&
              record['subtype'] === 'task_notification' &&
              typeof record['task_id'] === 'string'
            )
              files.delete(record['task_id']);
          }),
          SubscriptionRef.update(jobs, (list) =>
            next(list, record, Date.now(), links),
          ),
        ),
      changes: SubscriptionRef.changes(jobs),
      clear: Effect.andThen(
        Effect.sync(() => {
          links.clear();
          files.clear();
        }),
        SubscriptionRef.set(jobs, []),
      ),
      stop: (id) =>
        Effect.tryPromise({
          try: () => stopTask(id),
          catch: (cause) =>
            new HarnessError({
              message: `Claude Code did not stop background job ${id}`,
              cause,
            }),
        }),
      output: (id) =>
        Stream.unwrap(
          Effect.flatMap(listed(id), (job) =>
            job?.kind !== 'shell'
              ? Effect.succeed(Stream.empty)
              : Effect.map(fileOf(id), (path) =>
                  Option.match(path, {
                    onNone: () => Stream.empty,
                    onSome: (file) => followFile(file, ended(id)),
                  }),
                ),
          ),
        ),
    };
  });
