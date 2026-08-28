import type {
  OtelSpan,
  TraceGroup,
} from '@monorepo/frontend/components/blocks/otel-trace-viewer/trace-model';
import { AlertTriangleIcon } from '@monorepo/frontend/lucide';
import { cn } from '@monorepo/frontend/lib/utils';
import { formatRelativeTime, groupTracesBy } from './filtering';

export function TraceFeed({
  traces,
  allSpans,
  selectedTraceId,
  groupBy,
  expandedGroups,
  newCount,
  hasMore,
  traceFlowIds,
  onRevealNew,
  onShowMore,
  onSelectTrace,
  onToggleGroup,
}: {
  traces: TraceGroup[];
  allSpans: OtelSpan[];
  selectedTraceId: string | null;
  groupBy: string | null;
  expandedGroups: Record<string, boolean>;
  newCount: number;
  hasMore: boolean;
  traceFlowIds: Map<string, string>;
  onRevealNew: () => void;
  onShowMore: () => void;
  onSelectTrace: (trace: TraceGroup) => void;
  onToggleGroup: (name: string) => void;
}) {
  if (traces.length === 0 && newCount === 0) return <ListEmpty />;

  const content = groupBy
    ? groupTracesBy(traces, allSpans, groupBy).map((group) => {
        const expanded = expandedGroups[group.name] !== false;
        return (
          <div key={group.name}>
            <button
              type="button"
              onClick={() => onToggleGroup(group.name)}
              className="flex w-full items-center gap-2 border-b border-border/40 bg-muted/30 px-3 py-2 text-left text-xs"
            >
              <span className="min-w-0 flex-1 truncate font-mono">
                {group.name}
              </span>
              <span className="text-muted-foreground">{group.count}</span>
            </button>
            {expanded &&
              group.traces.map((trace) => (
                <TraceFeedRow
                  key={trace.traceId}
                  trace={trace}
                  selected={trace.traceId === selectedTraceId}
                  flowId={traceFlowIds.get(trace.traceId)}
                  onSelect={() => onSelectTrace(trace)}
                />
              ))}
          </div>
        );
      })
    : traces.map((trace) => (
        <TraceFeedRow
          key={trace.traceId}
          trace={trace}
          selected={trace.traceId === selectedTraceId}
          flowId={traceFlowIds.get(trace.traceId)}
          onSelect={() => onSelectTrace(trace)}
        />
      ));

  return (
    <div>
      {newCount > 0 && (
        <NewItemsButton count={newCount} onClick={onRevealNew} />
      )}
      {content}
      {hasMore && <ShowMoreButton onClick={onShowMore} />}
    </div>
  );
}

function TraceFeedRow({
  trace,
  selected,
  flowId,
  onSelect,
}: {
  trace: TraceGroup;
  selected: boolean;
  flowId?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full flex-col gap-1.5 border-b border-border/50 px-3 py-3 text-left transition-colors hover:bg-muted/40',
        selected && 'bg-primary/8',
      )}
    >
      <div className="flex w-full items-center gap-2">
        <StatusDot status={trace.status} />
        {trace.missingRoot && (
          <AlertTriangleIcon
            aria-label="No root span found"
            className="size-3.5 shrink-0 text-amber-500"
          >
            <title>No root span found</title>
          </AlertTriangleIcon>
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
          {trace.name}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {formatRelativeTime(trace.startTime)}
        </span>
      </div>
      <div className="flex w-full items-center gap-2 pl-4 text-[10px] text-muted-foreground">
        <span className="min-w-0 truncate">
          {trace.serviceName ?? 'Unknown service'}
        </span>
        <span className="ml-auto shrink-0">
          {trace.spanCount} span{trace.spanCount === 1 ? '' : 's'} ·{' '}
          {formatDuration(trace.duration)}
        </span>
      </div>
      {flowId && (
        <span
          title={`This trace is part of Flow ${flowId}`}
          className="ml-4 max-w-full self-start truncate rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
        >
          Flow · {flowId}
        </span>
      )}
    </button>
  );
}

function StatusDot({ status }: { status: TraceGroup['status'] }) {
  return (
    <span
      className={cn(
        'size-2 shrink-0 rounded-full',
        status === 'error' && 'bg-destructive',
        status === 'running' && 'animate-pulse bg-amber-500',
        status === 'success' && 'bg-emerald-600',
        status === 'unset' && 'bg-muted-foreground',
      )}
    />
  );
}

function NewItemsButton({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full border-b border-border bg-primary/8 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/12"
    >
      View {count} trace{count === 1 ? '' : 's'}
    </button>
  );
}

function ShowMoreButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-3 py-3 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
    >
      Show more
    </button>
  );
}

function ListEmpty() {
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">
      No traces
    </div>
  );
}

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null) return 'running';
  if (milliseconds < 1) return '<1ms';
  if (milliseconds < 1_000) return `${Math.round(milliseconds)}ms`;
  return `${(milliseconds / 1_000).toFixed(2)}s`;
}
