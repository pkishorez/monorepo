import { useSyncExternalStore } from 'react';

/*
 * Whether the screen is a phone's: under Tailwind's `sm`, where Monoverse
 * lays itself out for a thumb, so a component and its classes agree.
 */

const query = '(max-width: 639px)';

const subscribe = (onChange: () => void) => {
  const list = globalThis.matchMedia?.(query);
  list?.addEventListener('change', onChange);
  return () => list?.removeEventListener('change', onChange);
};

export function usePhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => globalThis.matchMedia?.(query).matches ?? false,
    () => false,
  );
}
