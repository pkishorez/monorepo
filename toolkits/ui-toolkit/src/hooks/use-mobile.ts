import * as React from 'react';

const MOBILE_BREAKPOINT = 768;
/** The screens `useIsMobile` calls a phone's. */
export const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};

// The server renders wide; hydration uses that too, then React re-renders
// with the real width, so server and client markup always match.
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}
