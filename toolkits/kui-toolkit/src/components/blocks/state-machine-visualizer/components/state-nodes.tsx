import { cn } from '#lib/utils';

import {
  CONTAINER_HEADER_HEIGHT,
  DESCRIPTION_LINE_HEIGHT,
  getDescriptionLineCount,
} from '../lib/metrics';
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
        node.type === 'final' && 'border-4 border-double border-border/50',
        node.type === 'history' && 'border-dashed bg-muted/25',
        node.type === 'choice' && 'border-dotted bg-accent/25',
        className,
      )}
    >
      <div className="flex min-h-10 w-full shrink-0 items-center gap-2 px-3">
        {node.type === 'choice' && (
          <span
            className="grid h-5 w-5 shrink-0 rotate-45 place-items-center border-2 border-foreground/60"
            aria-label="Choice state"
          />
        )}
        {node.type === 'final' && (
          <span
            className="h-3 w-3 shrink-0 bg-foreground/70"
            aria-label="Final state"
          />
        )}
        {node.type === 'history' && (
          <span className="text-[10px] font-bold text-muted-foreground">H</span>
        )}
        <span className="min-w-0 truncate text-[13px] font-semibold">
          {node.label}
        </span>
        {node.type === 'choice' && (
          <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Choice
          </span>
        )}
      </div>
      {node.description && (
        <StateNodeDescription description={node.description} />
      )}
    </div>
  );
}

function StateNodeDescription({
  description,
}: {
  readonly description: string;
}) {
  const lines = getDescriptionLineCount(description);

  return (
    <div className="min-h-0 w-full flex-1 overflow-hidden border-t border-border/70 px-3 py-2">
      <p
        className="overflow-hidden text-[10px] italic leading-4 text-muted-foreground"
        style={{
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: lines,
          maxHeight: lines * DESCRIPTION_LINE_HEIGHT,
        }}
      >
        {description}
      </p>
    </div>
  );
}

export function InitialNode({ className }: { readonly className?: string }) {
  return (
    <div className={cn('grid h-full w-full place-items-center', className)}>
      <span className="h-2 w-2 rounded-full bg-foreground shadow-sm" />
    </div>
  );
}
