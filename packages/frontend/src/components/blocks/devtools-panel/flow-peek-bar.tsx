import { ChevronUp, X } from 'lucide-react';
import type { RecordedFlowSchema } from '@pkishorez/effect-tracer/flow';
import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';

type RecordedFlowItem = (typeof RecordedFlowSchema.Type)['items'][number];

const kindDot: Record<RecordedFlowItem['kind'], string> = {
  activity: 'bg-violet-500',
  'activation-end': 'bg-emerald-500',
  'activation-start': 'bg-primary',
  'local-event': 'bg-sky-500',
  message: 'bg-amber-500',
  state: 'bg-muted-foreground',
};

const formatDuration = (milliseconds: number) => {
  if (milliseconds < 1) return `${Math.round(milliseconds * 1_000)} µs`;
  if (milliseconds < 1_000) return `${milliseconds.toFixed(0)} ms`;
  return `${(milliseconds / 1_000).toFixed(2)} s`;
};

const summaryOf = (item: RecordedFlowItem): string | null => {
  if (item.kind === 'activity')
    return item.duration === null ? 'running' : formatDuration(item.duration);
  if (item.kind === 'activation-end') return item.outcome;
  if (item.kind === 'message') return `→ ${item.destination}`;
  return null;
};

/**
 * Floats over the swimlane on small screens to show what is selected and
 * offer the details without taking the swimlane away.
 */
export function FlowPeekBar({
  item,
  onOpen,
  onClear,
  className,
}: {
  readonly item: RecordedFlowItem;
  readonly onOpen: () => void;
  readonly onClear: () => void;
  readonly className?: string;
}) {
  const summary = summaryOf(item);
  return (
    <div
      className={cn(
        'pointer-events-auto flex items-center gap-1 rounded-lg border bg-background/95 shadow-lg backdrop-blur supports-backdrop-filter:bg-background/80',
        className,
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-3 text-left"
        aria-label={`Inspect ${item.name}`}
      >
        <span
          aria-hidden
          className={cn('size-2 shrink-0 rounded-full', kindDot[item.kind])}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
          {item.name}
        </span>
        {summary && (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
            {summary}
          </span>
        )}
        <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
      </button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onClear}
        aria-label="Clear selection"
        className="mr-1 shrink-0"
      >
        <X />
      </Button>
    </div>
  );
}
