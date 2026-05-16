import { useEffect, useState } from 'react';

/**
 * Hook that prevents hydration mismatches by providing a fallback value during SSR
 * and the actual value after client-side hydration.
 *
 * @param getValue - Function that returns the client-side value
 * @param fallback - Value to return during SSR and before hydration
 * @returns The fallback value during SSR, then the actual value after hydration
 */
export function useClientOnly<T>(getValue: () => T, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setValue(getValue());
  }, [getValue]);

  return [mounted ? value : fallback, setValue] as [T, (value: T) => void];
}

/**
 * Simpler version that just returns false during SSR and true after hydration
 * Useful when you want to conditionally render client-only content
 */
export function useIsMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}
