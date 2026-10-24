import { View, useChildren } from '@kestack/kabuki/react';
import type { Handle } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { PlusIcon, XIcon } from '@kestack/web-platform/ui/components/lucide';
import { CounterView } from './counter-view.tsx';
import type { CounterLive } from './counter.ts';
import { CountersLive } from './counters.ts';

// Reads every Counter's count, to add them up. Reading never changes them.
function Total({
  counters,
}: {
  readonly counters: ReadonlyArray<Handle<typeof CounterLive>>;
}) {
  const counts = useChildren(counters, (counter) => counter.model.count);
  return (
    <p className="text-sm text-muted-foreground">
      Total{' '}
      <output className="font-semibold text-foreground tabular-nums">
        {counts.reduce((sum, count) => sum + count, 0)}
      </output>
    </p>
  );
}

// Draws the list: a Counter per Child, a button to remove each, one to add.
export const CountersView = View.make(
  CountersLive,
  ({ children, send, root }) => (
    <div
      {...root}
      className="flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-background"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border py-2 pr-2 pl-4">
        <Total counters={children.counters} />
        <Button
          variant="outline"
          size="lg"
          onClick={() => send({ _tag: 'Added' })}
        >
          <PlusIcon />
          Add a counter
        </Button>
      </div>
      <ul className="divide-y divide-border overflow-y-auto">
        {children.counters.map((counter, index) => (
          <li
            key={counter.key}
            className="flex items-center gap-1 py-2 pr-2 pl-4"
          >
            <CounterView instance={counter} />
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label={`Remove counter ${index + 1}`}
              className="text-muted-foreground"
              onClick={() => send({ _tag: 'Removed', id: counter.key })}
            >
              <XIcon />
            </Button>
          </li>
        ))}
        {children.counters.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            No counters yet. Add one above.
          </li>
        )}
      </ul>
    </div>
  ),
);
