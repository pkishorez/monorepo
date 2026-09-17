import type { FlowStatus } from '@pkishorez/flow';
import { cn } from 'kui-toolkit/lib/utils';

export interface FlowFeedRow {
  readonly id: string;
  readonly status: FlowStatus;
  readonly latestTimestamp: number;
  readonly participants: readonly string[];
  readonly entryCount: number;
}

export function FlowFeed({
  flows,
  selectedFlowId,
  onSelectFlow,
}: {
  flows: readonly FlowFeedRow[];
  selectedFlowId: string | null;
  onSelectFlow: (flowId: string) => void;
}) {
  if (flows.length === 0)
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        No flows
      </div>
    );
  return (
    <div>
      {flows.map((flow) => (
        <button
          type="button"
          key={flow.id}
          onClick={() => onSelectFlow(flow.id)}
          className={cn(
            'flex w-full flex-col gap-1.5 border-b border-border/50 px-3 py-3 text-left transition-colors hover:bg-muted/40',
            selectedFlowId === flow.id && 'bg-primary/8',
          )}
        >
          <div className="flex w-full items-center gap-2">
            <FlowStatusDot status={flow.status} />
            <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
              {flow.id}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {formatRelativeTime(flow.latestTimestamp)}
            </span>
          </div>
          <div className="truncate pl-4 text-[10px] text-muted-foreground">
            {flow.participants.join(' → ')} · {flow.entryCount} entr
            {flow.entryCount === 1 ? 'y' : 'ies'}
          </div>
        </button>
      ))}
    </div>
  );
}

export function FlowStatusDot({ status }: { status: FlowStatus }) {
  return (
    <span
      className={cn(
        'size-2 shrink-0 rounded-full',
        status === 'failed' && 'bg-destructive',
        status === 'active' && 'animate-pulse bg-primary',
        status === 'closed' && 'bg-muted-foreground/60',
        status === 'quiet' && 'bg-muted-foreground',
      )}
    />
  );
}

export function formatRelativeTime(timestamp: number) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
