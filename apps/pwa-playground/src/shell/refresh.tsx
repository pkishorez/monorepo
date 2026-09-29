import { useRouter } from '@tanstack/react-router';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

type Refreshers = Set<() => Promise<unknown> | void>;

const RefreshContext = createContext<Refreshers | undefined>(undefined);

export function RefreshProvider(props: { readonly children: ReactNode }) {
  const [refreshers] = useState<Refreshers>(() => new Set());
  return <RefreshContext value={refreshers}>{props.children}</RefreshContext>;
}

/**
 * Adds `refresh` to what the app's pull to refresh runs, next to reloading
 * the route's loaders. Use it on a page whose data is not a loader's.
 */
export function usePageRefresh(refresh: () => Promise<unknown> | void) {
  const refreshers = useContext(RefreshContext);
  const latest = useRef(refresh);
  useLayoutEffect(() => {
    latest.current = refresh;
  });
  useEffect(() => {
    if (refreshers === undefined) return;
    const run = () => latest.current();
    refreshers.add(run);
    return () => void refreshers.delete(run);
  }, [refreshers]);
}

/** Everything a pull refreshes: the route's loaders and every page refresher. */
export function useRefreshAll() {
  const router = useRouter();
  const refreshers = useContext(RefreshContext);
  return async () => {
    // Long enough to read "Refreshing", even when the work is instant.
    const shown = new Promise((resolve) => setTimeout(resolve, 450));
    await Promise.all([
      router.invalidate(),
      ...[...(refreshers ?? [])].map((run) => run()),
      shown,
    ]);
  };
}
