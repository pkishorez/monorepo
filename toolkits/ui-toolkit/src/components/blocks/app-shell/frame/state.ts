import { useEffect, useState, useSyncExternalStore } from 'react';
import { MOBILE_QUERY } from '#hooks/use-mobile';

const SHORTCUT = 'b';

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

/** ⌘B or Ctrl+B toggles the sidebar. */
export function useToggleShortcut(toggle: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);
}
