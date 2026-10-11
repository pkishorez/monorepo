import { useSyncExternalStore } from 'react';
import { Button } from '@kstackz/web-platform/components/button';

/*
 * Render counts kept outside React: a draw calls `counted(label)` each time it
 * runs, and the panel reads the counts. The panel is told on a microtask, so
 * counting during a render never sets state in another component.
 */

const counts = new Map<string, number>();
const listeners = new Set<() => void>();
let shown: ReadonlyArray<readonly [string, number]> = [];
let queued = false;

const changed = () => {
  shown = [...counts].sort(([a], [b]) => a.localeCompare(b));
  for (const listener of listeners) listener();
};

/** Count one render under `label`. */
export const counted = (label: string) => {
  counts.set(label, (counts.get(label) ?? 0) + 1);
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    changed();
  });
};

const reset = () => {
  counts.clear();
  changed();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Every count so far, with a reset. */
export const RenderCounts = () => {
  const rows = useSyncExternalStore(subscribe, () => shown);
  return (
    <aside className="flex flex-col gap-2 rounded-lg border p-3 text-xs">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-medium">Renders</h2>
        <Button size="sm" variant="ghost" onClick={reset}>
          Reset
        </Button>
      </div>
      <table className="font-mono tabular-nums">
        <tbody>
          {rows.map(([label, count]) => (
            <tr key={label} data-label={label}>
              <td className="pr-4 text-muted-foreground">{label}</td>
              <td className="text-right">{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  );
};
