import { Effect, Stream, SubscriptionRef } from 'effect';
import { HarnessError, type BackgroundJob } from '../../../../harness/index.js';
import { next } from './job-list.js';

export interface BackgroundJobs {
  /** Reads one record the query yielded. */
  readonly observe: (
    record: Readonly<Record<string, unknown>>,
  ) => Effect.Effect<void>;
  /** The current list first, then each change. */
  readonly changes: Stream.Stream<ReadonlyArray<BackgroundJob>>;
  readonly stop: (id: string) => Effect.Effect<void, HarnessError>;
}

/**
 * The agent's Background Jobs, kept from the task records the query yields.
 * `stopTask` asks Claude Code to stop one; the list drops it once Claude
 * Code reports it stopped.
 */
export const makeBackgroundJobs = (
  stopTask: (id: string) => Promise<void>,
): Effect.Effect<BackgroundJobs> =>
  Effect.gen(function* () {
    const jobs = yield* SubscriptionRef.make<ReadonlyArray<BackgroundJob>>([]);
    return {
      observe: (record) =>
        SubscriptionRef.update(jobs, (list) => next(list, record, Date.now())),
      changes: SubscriptionRef.changes(jobs),
      stop: (id) =>
        Effect.tryPromise({
          try: () => stopTask(id),
          catch: (cause) =>
            new HarnessError({
              message: `Claude Code did not stop background job ${id}`,
              cause,
            }),
        }),
    };
  });
