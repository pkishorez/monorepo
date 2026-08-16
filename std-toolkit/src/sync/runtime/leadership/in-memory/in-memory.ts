import { Effect, Layer, Semaphore } from 'effect';
import { LeadershipService, type LeadershipObserver } from '../leadership.js';

type Entry = {
  readonly semaphore: Semaphore.Semaphore;
  references: number;
};

export const inMemoryLeadership = () => {
  const entries = new Map<string, Entry>();
  const unobserved: LeadershipObserver = {
    requested: Effect.void,
    acquired: Effect.void,
    released: Effect.void,
  };

  return Layer.succeed(LeadershipService, {
    run: (identity, effect, observer = unobserved) =>
      Effect.acquireUseRelease(
        Effect.sync(() => {
          const current = entries.get(identity);
          if (current) {
            current.references += 1;
            return current;
          }
          const created: Entry = {
            semaphore: Semaphore.makeUnsafe(1),
            references: 1,
          };
          entries.set(identity, created);
          return created;
        }),
        (entry) =>
          observer.requested.pipe(
            Effect.andThen(
              entry.semaphore.withPermit(
                observer.acquired.pipe(
                  Effect.andThen(effect),
                  Effect.ensuring(observer.released),
                ),
              ),
            ),
          ),
        (entry) =>
          Effect.sync(() => {
            entry.references -= 1;
            if (entry.references === 0) entries.delete(identity);
          }),
      ),
  });
};
