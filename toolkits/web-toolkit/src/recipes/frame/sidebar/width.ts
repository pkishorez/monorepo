import { useCallback, useEffect, useState } from 'react';

/**
 * The sidebar's width on a wide screen, kept in `localStorage` under `key`
 * so it stays as the person left it. Give both to `AppShell`'s sidebar
 * (`width`, `onWidthChange`) to let them resize it by its edge.
 */
export const useSidebarWidth = (key: string, initial = 256) => {
  const [width, setWidth] = useState(initial);
  // Read after mount: the server renders the default.
  useEffect(() => {
    const stored = Number(localStorage.getItem(key));
    if (Number.isFinite(stored) && stored > 0) setWidth(stored);
  }, [key]);
  const change = useCallback(
    (next: number) => {
      setWidth(next);
      localStorage.setItem(key, String(next));
    },
    [key],
  );
  return [width, change] as const;
};
