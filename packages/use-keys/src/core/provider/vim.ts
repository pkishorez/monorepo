/**
 * Whether Vim Mode is on in one Keys Provider, read without React, and
 * how to ask the app to change it. The app keeps it; the provider only
 * mirrors what it was last given.
 */
export const createVim = (initial: boolean) => {
  let on = initial;
  let ask: (next: boolean) => void = () => {};
  const listeners = new Set<() => void>();
  return {
    on: () => on,
    /** Asks the app to turn Vim Mode on or off. */
    set: (next: boolean) => ask(next),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** What the app says now, and how to ask it for a change. */
    sync: (next: boolean, request: (next: boolean) => void) => {
      ask = request;
      if (next === on) return;
      on = next;
      for (const listener of listeners) listener();
    },
  };
};

export type Vim = ReturnType<typeof createVim>;
