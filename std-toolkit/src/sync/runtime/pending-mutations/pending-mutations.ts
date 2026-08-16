import { Effect } from 'effect';

export type PendingTracker = {
  increment: (key: string) => void;
  decrement: (key: string) => void;
  count: (key: string) => number;
  subscribe: (listener: () => void) => () => void;
};

export const makePendingTracker: Effect.Effect<PendingTracker> = Effect.sync(
  () => {
    const counts = new Map<string, number>();
    const listeners = new Set<() => void>();
    const notify = (): void => {
      for (const listener of listeners) listener();
    };
    return {
      increment: (key) => {
        counts.set(key, (counts.get(key) ?? 0) + 1);
        notify();
      },
      decrement: (key) => {
        const next = (counts.get(key) ?? 0) - 1;
        if (next <= 0) counts.delete(key);
        else counts.set(key, next);
        notify();
      },
      count: (key) => counts.get(key) ?? 0,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  },
);
