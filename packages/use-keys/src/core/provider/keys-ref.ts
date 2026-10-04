import type { Keys } from '../key/index.ts';

/**
 * The Keys under way, read with `current` like any ref, without
 * re-rendering. `subscribe` hears each change, for `useKeysState`.
 */
export type KeysRef = {
  readonly current: Keys;
  readonly subscribe: (listener: () => void) => () => void;
};

const NONE: Keys = [];

/** A KeysRef, and the `set` that changes it and tells its subscribers. */
export const createKeysRef = () => {
  let current = NONE;
  const listeners = new Set<() => void>();
  const ref: KeysRef = {
    get current() {
      return current;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const set = (next: Keys) => {
    current = next;
    for (const listener of listeners) listener();
  };
  return { ref, set, empty: () => set(NONE) };
};
