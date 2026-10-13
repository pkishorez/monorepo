import { useCallback, useState } from 'react';

const prefix = 'laymos.';

function read<T>(key: string, fallback: T): T {
  try {
    const stored = globalThis.localStorage?.getItem(prefix + key);
    if (stored == null) return fallback;
    const value: unknown = JSON.parse(stored);
    if (typeof value !== typeof fallback) return fallback;
    // An object keeps the fields it was saved with and gains any added since.
    return typeof fallback === 'object' && fallback !== null
      ? { ...fallback, ...(value as object) }
      : (value as T);
  } catch {
    return fallback;
  }
}

/**
 * A preference: state the browser keeps across reloads under `key`. A
 * stored value of the wrong shape, or a browser that keeps nothing, falls
 * back to `fallback`; changes still apply for the visit.
 */
export function usePreference<T>(
  key: string,
  fallback: T,
): readonly [T, (next: T) => void] {
  const [value, setValue] = useState(() => read(key, fallback));
  const change = useCallback(
    (next: T) => {
      setValue(next);
      try {
        globalThis.localStorage?.setItem(prefix + key, JSON.stringify(next));
      } catch {
        // Kept for this visit only.
      }
    },
    [key],
  );
  return [value, change] as const;
}
