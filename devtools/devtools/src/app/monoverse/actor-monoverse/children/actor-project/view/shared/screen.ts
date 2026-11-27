import { useSyncExternalStore } from 'react';

const belowTailwindSm = '(max-width: 639px)';
const wide = '(min-width: 1200px)';

const useMedia = (query: string): boolean =>
  useSyncExternalStore(
    (onChange) => {
      const list = globalThis.matchMedia?.(query);
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    () => globalThis.matchMedia?.(query).matches ?? false,
    () => false,
  );

export function usePhone(): boolean {
  return useMedia(belowTailwindSm);
}

export function useWide(): boolean {
  return useMedia(wide);
}
