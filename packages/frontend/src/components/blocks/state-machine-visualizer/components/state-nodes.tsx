import { cn } from '#lib/utils';

import { CONTAINER_HEADER_HEIGHT } from '../lib/metrics';
import type { StateMachineSceneNode } from '../types';

export function StateNode({
  node,
  className,
}: {
  readonly node: StateMachineSceneNode;
  readonly className?: string;
}) {
  if (node.container) {
    return (
      <div
        className={cn(
          'relative h-full w-full overflow-hidden rounded-lg border border-border bg-muted/15',
          node.type === 'parallel' && 'border-dashed bg-muted/25',
          className,
        )}
      >
        <div
          className="absolute inset-x-0 top-0 flex items-center gap-2.5 border-b border-border bg-card/80 px-4"
          style={{ height: CONTAINER_HEADER_HEIGHT }}
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-muted text-[10px] font-bold text-muted-foreground">
            {node.type === 'parallel' ? 'Ⅱ' : '▣'}
          </span>
          <span className="min-w-0 truncate text-[13px] font-semibold">
            {node.label}
          </span>
          <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {node.type}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden rounded-md border-2 border-border bg-card text-card-foreground shadow-sm',
        node.initial &&
          'border-[3px] border-primary bg-primary/[0.06] ring-2 ring-primary/15',
        node.type === 'final' &&
          'border-4 border-double border-foreground/60 bg-muted/30',
        node.type === 'history' && 'border-dashed bg-muted/25',
        className,
      )}
    >
      <div className="flex min-h-10 w-full items-center gap-2 px-3">
        {node.type === 'final' && (
          <span
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-foreground/60"
            aria-label="Final state"
          >
            <span className="h-2 w-2 rounded-full bg-foreground/60" />
          </span>
        )}
        {node.type === 'history' && (
          <span className="text-[10px] font-bold text-muted-foreground">H</span>
        )}
        <span className="min-w-0 truncate text-[13px] font-semibold">
          {node.label}
        </span>
        {node.initial && (
          <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-primary">
            Initial
          </span>
        )}
        {node.type === 'final' && (
          <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-foreground/70">
            Final
          </span>
        )}
      </div>
      {node.description && (
        <p className="line-clamp-2 w-full flex-1 border-t border-border/70 px-3 py-2 text-[10px] italic leading-4 text-muted-foreground">
          {node.description}
        </p>
      )}
    </div>
  );
}

export function InitialNode({ className }: { readonly className?: string }) {
  return (
    <div
      className={cn(
        'h-full w-full rounded-full border-[3px] border-background bg-primary shadow-sm ring-2 ring-primary/20',
        className,
      )}
    />
  );
}
