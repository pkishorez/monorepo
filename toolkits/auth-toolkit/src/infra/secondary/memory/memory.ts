import type { SecondaryStorage } from 'better-auth';

interface Entry {
  value: string;
  expiresAt: number | undefined;
}

/**
 * An in-memory Session Store — for tests, not for deployment (state is
 * per-process and vanishes on restart).
 */
export const memorySessionStore = (): SecondaryStorage => {
  const store = new Map<string, Entry>();

  const read = (key: string) => {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && entry.expiresAt < Date.now()) {
      store.delete(key);
      return undefined;
    }
    return entry;
  };

  return {
    get: (key) => read(key)?.value ?? null,
    set: (key, value, ttl) =>
      void store.set(key, {
        value,
        expiresAt: ttl ? Date.now() + ttl * 1000 : undefined,
      }),
    delete: (key) => void store.delete(key),
    getAndDelete: (key) => {
      const value = read(key)?.value ?? null;
      store.delete(key);
      return value;
    },
    increment: (key, ttl) => {
      const current = read(key);
      const next = (current ? Number.parseInt(current.value, 10) : 0) + 1;
      store.set(key, {
        value: String(next),
        expiresAt: current?.expiresAt ?? Date.now() + ttl * 1000,
      });
      return next;
    },
  };
};
