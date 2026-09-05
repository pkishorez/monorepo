import { cn } from 'kui-toolkit/lib/utils';
import { formatRelativeTime } from './filtering';

type FlowContext = {
  participants: Set<string>;
  services: Set<string>;
  searchText: string;
};

export function FlowFeed({
  flows,
  contexts,
  selectedFlowId,
  newCount,
  hasMore,
  onRevealNew,
  onShowMore,
  onSelectFlow,
}: {
  flows: Array<{ flowId: string; latestTimeUnixNano: string; status: string }>;
  contexts: Map<string, FlowContext>;
  selectedFlowId: string | null;
  newCount: number;
  hasMore: boolean;
  onRevealNew: () => void;
  onShowMore: () => void;
  onSelectFlow: (flowId: string) => void;
}) {
  if (flows.length === 0 && newCount === 0)
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        No flows
      </div>
    );
  return (
    <div>
      {newCount > 0 && (
        <NewItemsButton count={newCount} onClick={onRevealNew} />
      )}
      {flows.map((flow) => {
        const context = contexts.get(flow.flowId);
        return (
          <button
            type="button"
            key={flow.flowId}
            onClick={() => onSelectFlow(flow.flowId)}
            className={cn(
              'flex w-full flex-col gap-1.5 border-b border-border/50 px-3 py-3 text-left transition-colors hover:bg-muted/40',
              selectedFlowId === flow.flowId && 'bg-primary/8',
            )}
          >
            <div className="flex w-full items-center gap-2">
              <FlowStatusDot status={flow.status} />
              <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
                {flow.flowId}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {formatRelativeTime(flowTimestamp(flow.latestTimeUnixNano))}
              </span>
            </div>
            <div className="truncate pl-4 text-[10px] text-muted-foreground">
              {context && context.participants.size > 0
                ? Array.from(context.participants).join(' → ')
                : 'No participants loaded'}
            </div>
          </button>
        );
      })}
      {hasMore && <ShowMoreButton onClick={onShowMore} />}
    </div>
  );
}

function FlowStatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'size-2 shrink-0 rounded-full',
        status === 'failed' && 'bg-destructive',
        status === 'active' && 'animate-pulse bg-amber-500',
        status === 'completed' && 'bg-emerald-600',
        (status === 'interrupted' || status === 'unknown') &&
          'bg-muted-foreground',
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
      View {count} flow{count === 1 ? '' : 's'}
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

function flowTimestamp(nanoseconds: string) {
  try {
    return Number(BigInt(nanoseconds) / 1_000_000n);
  } catch {
    return 0;
  }
}
