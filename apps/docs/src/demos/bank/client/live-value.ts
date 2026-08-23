export interface LiveValue<T> {
  readonly get: () => T;
  readonly subscribe: (listener: () => void) => () => void;
  readonly update: (patch: (current: T) => T) => void;
}

export const makeLiveValue = <T>(initial: T): LiveValue<T> => {
  let state = initial;
  let scheduled = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    scheduled = false;
    listeners.forEach((listener) => listener());
  };
  return {
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update: (patch) => {
      state = patch(state);
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(notify);
    },
  };
};
