import { Effect } from 'effect';

/**
 * Per-collection+partition strategy-owned state store, keyed by partition key.
 * State is opaque to the engine — only the owning strategy interprets it. All
 * methods return `Effect` so an IndexedDB swap stays signature-stable; the body
 * closes over an in-memory `Map`.
 */
export const makeSyncStateStore = <TState = unknown>(): {
  get: (key: string) => Effect.Effect<TState | null>;
  set: (key: string, state: TState) => Effect.Effect<void>;
} => {
  const map = new Map<string, TState>();
  return {
    get: (key) => Effect.sync(() => map.get(key) ?? null),
    set: (key, state) =>
      Effect.sync(() => {
        map.set(key, state);
      }),
  };
};
