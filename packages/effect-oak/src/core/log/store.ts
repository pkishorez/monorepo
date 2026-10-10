/**
 * One value and the listeners told when it is replaced. Every change is a new
 * value, so `useSyncExternalStore` sees it.
 */
export const makeStore = <A>(initial: A) => {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: A) => {
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
