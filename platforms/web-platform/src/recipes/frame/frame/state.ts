import { useState, useSyncExternalStore } from 'react';
import { MOBILE_QUERY } from '#hooks/use-mobile';

const noSubscription = () => () => {};

/** False while the server renders and hydration matches it, then true. */
export function useHydrated() {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/**
 * The sidebar's one open state, at every screen size. It starts open, except
 * on a phone, where it starts shut so the page shows first. The server can't
 * tell a phone, so it renders open, and so does hydration: `shown` is the
 * state for the markup, `open` the real one for the motion, which draws
 * nothing until then.
 */
export function useOpenState() {
  const [open, setOpen] = useState(
    () =>
      typeof window === 'undefined' || !window.matchMedia(MOBILE_QUERY).matches,
  );
  const shown = useHydrated() ? open : true;
  return { open, shown, setOpen };
}
