import { useSyncExternalStore } from 'react';

/*
 * How wide the screen is, as Monoverse lays itself out: a phone's, under
 * Tailwind's `sm`, for a thumb; or wide enough for a panel either side of
 * the centred tree. A component and its classes agree on both.
 */

const phone = '(max-width: 639px)';
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
  return useMedia(phone);
}

/** Room for the side panels: the tree centred, the controls either side of it. */
export function useWide(): boolean {
  return useMedia(wide);
}
