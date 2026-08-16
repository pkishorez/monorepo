import { Effect, Layer, Semaphore } from 'effect';
import { LeadershipService } from '../leadership.js';

type Entry = {
  readonly semaphore: Semaphore.Semaphore;
  references: number;
};

export const inMemoryLeadership = () => {
  const entries = new Map<string, Entry>();

  return Layer.succeed(LeadershipService, {
    run: (identity, effect) =>
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
        (entry) => entry.semaphore.withPermit(effect),
        (entry) =>
          Effect.sync(() => {
            entry.references -= 1;
            if (entry.references === 0) entries.delete(identity);
          }),
      ),
  });
};
