import { useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Router } from '@kestack/kabuki/routing';
import type { Preload } from '@kestack/kabuki/routing';
import { CircleCheckIcon } from '@kestack/web-platform/components/lucide';
import { Spinner } from '@kestack/web-platform/components/spinner';
import type { router } from '../../shared/pages/index.ts';

/*
 * A link that shows its preload as it happens. Hovering asks the Router to
 * preload; the Router asks the server at `/_kabuki/load`. The link watches
 * those requests finish, with the browser's own Resource Timing, so
 * "Ready" means the data really arrived. A preload of a copy still fresh
 * asks nothing, so a link that was ready stays ready while fresh. Two
 * links hovered at once could each take the other's answer: good enough
 * for a demonstration.
 */

/** When each request to the Loader RPC started and ended, in `performance.now()` time. */
const loads: Array<{ readonly start: number; readonly end: number }> = [];
const listeners = new Set<() => void>();
let observer: PerformanceObserver | undefined;

const subscribe = (changed: () => void) => {
  observer ??= new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      if (entry.name.includes('/_kabuki/load'))
        loads.push({
          start: entry.startTime,
          end: (entry as PerformanceResourceTiming).responseEnd,
        });
    for (const listener of listeners) listener();
  });
  observer.observe({ type: 'resource' });
  listeners.add(changed);
  return () => listeners.delete(changed);
};

const count = () => loads.length;

/** How long a preloaded copy stays fresh: the item page's Stale time. */
const FRESH = 30_000;

export function PreloadLink({
  to,
  preload,
  current,
  children,
}: {
  readonly to: typeof router.route.Type;
  readonly preload: Preload;
  /** Whether it is the page shown. */
  readonly current: boolean;
  readonly children: ReactNode;
}) {
  useSyncExternalStore(subscribe, count, () => 0);
  const [hovered, setHovered] = useState<number | null>(null);
  const load =
    hovered === null ? undefined : loads.find((each) => each.start >= hovered);
  const fresh = load !== undefined && performance.now() - load.end < FRESH;
  const status = !preload
    ? 'Never preloads'
    : load
      ? `Ready in ${((load.end - load.start) / 1000).toFixed(1)} s`
      : hovered !== null
        ? 'Preloading…'
        : 'Hover to preload';
  return (
    <Router.Link
      to={to}
      preload={preload}
      aria-current={current ? 'page' : undefined}
      onPointerEnter={() => {
        if (preload && !fresh) setHovered(performance.now());
      }}
      className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors duration-150 hover:bg-muted aria-[current=page]:bg-muted"
    >
      <span className="font-medium">{children}</span>
      <span
        className={`flex items-center gap-1.5 text-xs tabular-nums ${load ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        {hovered !== null && !load && <Spinner className="size-3" />}
        {load && <CircleCheckIcon className="size-3.5 text-positive" />}
        {status}
      </span>
    </Router.Link>
  );
}
