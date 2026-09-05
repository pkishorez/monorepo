import { Deferred, Effect, Exit } from 'effect';
import { OutboxEntryFailed, type OutboxEntry } from '../entries/index.js';
import type { WriteError } from '../../domain/sync-error/index.js';

const POLL_MS = 5_000;

type Wake = Deferred.Deferred<void>;

export const makeWaiters = (
  byId: (id: string) => Effect.Effect<OutboxEntry | null, WriteError>,
) => {
  const waiting = new Map<string, Set<Wake>>();
  const rejected = new Map<string, string>();

  // Snapshot first: a woken waiter resumes synchronously and registers its
  // next wake in the same set.
  const wake = (wakes: Iterable<Wake>): void => {
    for (const wake of Array.from(wakes)) Deferred.doneUnsafe(wake, Exit.void);
  };

  const wakeId = (id: string): void => {
    const wakes = waiting.get(id);
    if (wakes) wake(wakes);
  };

  const wakeAll = (): void => {
    for (const wakes of Array.from(waiting.values())) wake(wakes);
  };

  const reject = (id: string, reason: string): void => {
    rejected.set(id, reason);
    wakeId(id);
  };

  const settled = (
    id: string,
  ): Effect.Effect<boolean, OutboxEntryFailed | WriteError> =>
    Effect.gen(function* () {
      const reason = rejected.get(id);
      if (reason !== undefined) {
        return yield* new OutboxEntryFailed({ entryId: id, reason });
      }
      const entry = yield* byId(id);
      if (entry === null) return true;
      if (entry.status === 'failed') {
        return yield* new OutboxEntryFailed({
          entryId: id,
          reason: 'the Backend rejected this write',
        });
      }
      return false;
    });

  const delivered = (
    id: string,
  ): Effect.Effect<void, OutboxEntryFailed | WriteError> =>
    Effect.gen(function* () {
      while (!(yield* settled(id))) {
        const wake = yield* Deferred.make<void>();
        const wakes = waiting.get(id) ?? new Set<Wake>();
        wakes.add(wake);
        waiting.set(id, wakes);
        yield* Deferred.await(wake).pipe(
          Effect.timeoutOption(POLL_MS),
          Effect.ensuring(
            Effect.sync(() => {
              wakes.delete(wake);
              if (wakes.size === 0) waiting.delete(id);
            }),
          ),
        );
      }
    }).pipe(Effect.ensuring(Effect.sync(() => rejected.delete(id))));

  return {
    delivered,
    wakeId,
    wakeAll,
    reject,
    rejectAll: (reason: string): void => {
      for (const id of waiting.keys()) rejected.set(id, reason);
      wakeAll();
    },
    waitingIds: (): string[] => [...waiting.keys()],
  };
};
