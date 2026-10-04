import type { Progress } from '../../core/provider/index.ts';

type Handler = {
  readonly run: { readonly current: () => void };
  /** The Action's `repeat`, as its Handler overrides it. */
  readonly repeat: boolean | undefined;
};

/**
 * One keyboard's Handlers, by Action id, and its Sequences under way.
 * Every change is a new `version`, for `useSyncExternalStore`.
 */
export const createHandlers = () => {
  const handlers = new Map<string, ReadonlyArray<Handler>>();
  const progress = new Map<string, ReadonlyArray<Progress>>();
  const listeners = new Set<() => void>();
  let version = 0;

  const changed = () => {
    version += 1;
    for (const listener of listeners) listener();
  };

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: () => version,

    /** Adds a Handler; when the Action has one, the first keeps it. */
    add: (id: string, handler: Handler) => {
      handlers.set(id, [...(handlers.get(id) ?? []), handler]);
      changed();
      return () => {
        const left = (handlers.get(id) ?? []).filter((h) => h !== handler);
        if (left.length > 0) handlers.set(id, left);
        else handlers.delete(id);
        changed();
      };
    },
    /** The Handler that keeps the Action, if any. */
    handler: (id: string) => handlers.get(id)?.[0],

    /** Sets, or clears, how far the Action's Sequences have come. */
    progress: (id: string, under: ReadonlyArray<Progress> | undefined) => {
      if (under === undefined && !progress.has(id)) return;
      if (under === undefined) progress.delete(id);
      else progress.set(id, under);
      changed();
    },
    under: () => progress,
  };
};

export type Handlers = ReturnType<typeof createHandlers>;
