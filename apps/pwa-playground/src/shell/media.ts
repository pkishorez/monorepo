import { useSyncExternalStore } from 'react';

/** Whether `query` matches; false on the server and before hydration. */
export const useMedia = (query: string): boolean =>
  useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );

/** A finger is the main pointer: the app's own swipes and pulls are on. */
export const useTouch = () => useMedia('(pointer: coarse)');

/** Wide enough that the nav sits beside the page instead of in a drawer. */
export const useWide = () => useMedia('(min-width: 64rem)');
