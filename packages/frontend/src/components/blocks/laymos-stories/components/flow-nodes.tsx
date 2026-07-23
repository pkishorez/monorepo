import {
  Handle,
  NodeToolbar,
  Position,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import {
  Box,
  ChevronsDownUp,
  CircleCheck,
  CircleDashed,
  CircleStop,
  GitBranch,
  OctagonX,
  Play,
  XCircle,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '#lib/utils';

import type { StoryGraphNode } from '../lib/model';

export interface ProgressiveNodeData extends Record<string, unknown> {
  readonly graphNode: StoryGraphNode;
  readonly selected: boolean;
  readonly hovered: boolean;
  readonly related: boolean;
  readonly dimmed: boolean;
  readonly muted: boolean;
  readonly hiddenNodeCount: number;
  readonly showDescriptionPopover: boolean;
  readonly inline: boolean;
  readonly scopeDepth: number;
  readonly actions?: ReactNode;
}

function NodeActions({
  visible,
  children,
}: {
  visible: boolean;
  children?: ReactNode;
}) {
  if (children === undefined) return null;
  return (
    <NodeToolbar
      isVisible={visible}
      position={Position.Bottom}
      align="center"
      offset={10}
      className="nodrag nopan nowheel"
    >
      {children}
    </NodeToolbar>
  );
}

function DescriptionPopover({
  title,
  description,
  visible,
}: {
  readonly title: string;
  readonly description?: string;
  readonly visible: boolean;
}) {
  const [position, setPosition] = useState(Position.Right);
  if (!description) return null;
  return (
    <NodeToolbar
      isVisible={visible}
      position={position}
      align="center"
      offset={12}
      className="nodrag nopan nowheel"
    >
      <aside
        className="relative max-h-80 w-80 overflow-y-auto rounded-lg border border-border bg-popover p-4 text-left text-popover-foreground shadow-xl"
        onMouseEnter={() =>
          setPosition((current) =>
            current === Position.Right ? Position.Left : Position.Right,
          )
        }
      >
        <span
          className={cn(
            'absolute top-1/2 size-3 -translate-y-1/2 rotate-45 border-border bg-popover',
            position === Position.Right
              ? '-left-1.5 border-b border-l'
              : '-right-1.5 border-r border-t',
          )}
        />
        <p className="text-xs font-semibold">{title}</p>
        <div className="mt-2 text-[11px] leading-5 text-muted-foreground [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p:not(:first-child)]:mt-2 [&_pre]:mt-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {description}
          </ReactMarkdown>
        </div>
      </aside>
    </NodeToolbar>
  );
}

const kindIcon = {
  flow: Box,
  step: Box,
  decision: GitBranch,
  terminal: CircleStop,
} as const;

const kindStyle = {
  flow: {
    node: 'border-border bg-muted/20',
    icon: 'text-muted-foreground',
  },
  step: {
    node: 'border-border bg-background',
    icon: 'text-muted-foreground',
  },
  decision: {
    node: 'border-foreground/30 bg-background',
    icon: 'text-foreground',
  },
  terminal: {
    node: 'border-slate-500/75 bg-slate-500/15 shadow-slate-500/15',
    icon: 'text-slate-500',
  },
} as const;

function terminalPresentation(
  block: Extract<StoryGraphNode, { kind: 'block' }>['block'],
) {
  if (block.kind !== 'terminal') return undefined;
  if (block.completion?.kind === 'success') {
    return {
      Icon: CircleCheck,
      node: 'border-emerald-500/75 bg-emerald-500/15 shadow-emerald-500/15',
      icon: 'text-emerald-600 dark:text-emerald-400',
    };
  }
  if (block.completion?.kind === 'error') {
    return {
      Icon: OctagonX,
      node: 'border-rose-500/75 bg-rose-500/15 shadow-rose-500/15',
      icon: 'text-rose-600 dark:text-rose-400',
    };
  }
  return {
    Icon: CircleStop,
    node: 'border-slate-500/75 bg-slate-500/15 shadow-slate-500/15',
    icon: 'text-slate-500',
  };
}

function ProgressiveBlockNode({ data }: NodeProps<Node<ProgressiveNodeData>>) {
  const {
    graphNode,
    selected,
    hovered,
    related,
    dimmed,
    muted,
    hiddenNodeCount,
    showDescriptionPopover,
    inline,
    scopeDepth,
    actions,
  } = data;
  const collapsed = hiddenNodeCount > 0;
  if (graphNode.kind === 'arm') {
    const description = [
      graphNode.arm.description,
      graphNode.arm.errors === undefined
        ? undefined
        : `May fail with ${graphNode.arm.errors.join(', ')}.`,
      graphNode.arm.completion?.kind === 'success'
        ? 'Completes successfully.'
        : graphNode.arm.completion?.kind === 'error'
          ? `Completes with ${graphNode.arm.completion.error}.`
          : undefined,
    ]
      .filter((value) => value !== undefined)
      .join(' ');
    return (
      <div
        className={cn(
          'relative flex h-full w-full items-center justify-center rounded-full border border-border bg-background px-3 text-center text-[9px] font-medium text-muted-foreground transition-all duration-150',
          graphNode.active &&
            'cursor-pointer hover:border-primary/45 hover:shadow-md',
          related && graphNode.active && 'border-primary/55 bg-primary/[0.04]',
          hovered &&
            graphNode.active &&
            'border-primary shadow-md ring-2 ring-primary/20',
          selected &&
            graphNode.active &&
            'border-primary bg-primary/[0.07] shadow-lg ring-[3px] ring-primary/35',
          collapsed &&
            'cursor-context-menu rounded-md border-primary/45 bg-primary/[0.04] shadow-md',
          !graphNode.active &&
            'cursor-default border-dashed border-muted-foreground/35 bg-muted/20 text-muted-foreground opacity-35',
          muted && !selected && 'opacity-40',
          dimmed && 'opacity-15',
        )}
        aria-disabled={!graphNode.active}
        title={collapsed ? 'Collapsed — right-click to expand' : undefined}
      >
        <DescriptionPopover
          title={graphNode.arm.name}
          description={description}
          visible={selected && showDescriptionPopover}
        />
        <NodeActions visible={selected}>{actions}</NodeActions>
        <Handle
          type="target"
          position={Position.Top}
          className="!size-1 !border-background !bg-muted-foreground"
        />
        <span className="flex min-w-0 flex-col items-center leading-none">
          <span className="max-w-full truncate">{graphNode.arm.name}</span>
          {hiddenNodeCount > 0 && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[7px] font-semibold text-primary">
              <ChevronsDownUp className="size-2" aria-hidden />
              {hiddenNodeCount} hidden
            </span>
          )}
        </span>
        <Handle
          type="source"
          position={Position.Bottom}
          className="!size-1 !border-background !bg-muted-foreground"
        />
      </div>
    );
  }
  if (graphNode.block.kind === 'flow' && inline) {
    return (
      <div
        className={cn(
          'relative h-full w-full rounded-xl border transition-all duration-150',
          scopeDepth === 0
            ? 'border-foreground/[0.1] bg-transparent'
            : 'border-foreground/[0.12] bg-foreground/[0.015]',
          hovered && 'border-foreground/25',
          selected && 'border-foreground/40',
        )}
      >
        <DescriptionPopover
          title={graphNode.block.name}
          description={graphNode.block.description}
          visible={selected && showDescriptionPopover}
        />
        <NodeActions visible={selected}>{actions}</NodeActions>
        <span className="absolute left-3 top-2 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
          <Box className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{graphNode.block.name}</span>
        </span>
      </div>
    );
  }
  const terminal = terminalPresentation(graphNode.block);
  const Icon = terminal?.Icon ?? kindIcon[graphNode.block.kind];
  const colors = kindStyle[graphNode.block.kind];
  const description = graphNode.block.description;
  const startsFlows = graphNode.startsFlows ?? [];
  const outcome = graphNode.visit?.outcome;
  const status =
    graphNode.visit?.terminalMismatch === true
      ? {
          Icon: XCircle,
          label: 'Terminal mismatch',
          className: 'border-destructive/40 bg-destructive/10 text-destructive',
        }
      : outcome === 'failed' && graphNode.expectedFailure
        ? {
            Icon: XCircle,
            label: 'Expected failure',
            className:
              'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300',
          }
        : outcome === 'failed'
          ? {
              Icon: XCircle,
              label: 'Failed',
              className:
                'border-destructive/35 bg-destructive/10 text-destructive',
            }
          : outcome === 'interrupted'
            ? {
                Icon: CircleDashed,
                label: 'Interrupted',
                className:
                  'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300',
              }
            : undefined;
  return (
    <div
      className={cn(
        'relative flex h-full w-full items-center gap-2.5 rounded-md border px-3 py-3 shadow-sm transition-all duration-150',
        !terminal && 'hover:border-primary/45 hover:shadow-md',
        colors.node,
        terminal?.node,
        startsFlows.length > 0 &&
          'outline outline-1 outline-offset-[3px] outline-foreground/35',
        related && !terminal && 'border-primary/55 bg-primary/[0.04]',
        hovered &&
          !terminal &&
          'border-primary shadow-md ring-2 ring-primary/20',
        hovered && terminal && 'shadow-md ring-2 ring-primary/25',
        selected &&
          !terminal &&
          'border-primary bg-primary/[0.07] shadow-lg ring-[3px] ring-primary/35',
        selected && terminal && 'shadow-lg ring-[3px] ring-primary/40',
        terminal &&
          graphNode.visit?.terminalMismatch === true &&
          'border-destructive shadow-destructive/20 outline-2 outline-offset-2 outline-dashed outline-destructive',
        collapsed &&
          'cursor-context-menu border-primary/45 bg-primary/[0.04] shadow-md',
        (outcome === 'failed' || graphNode.visit?.terminalMismatch === true) &&
          !terminal &&
          !graphNode.expectedFailure &&
          'border-destructive/70 bg-destructive/[0.04] shadow-destructive/10',
        ((outcome === 'failed' && graphNode.expectedFailure) ||
          outcome === 'interrupted') &&
          !terminal &&
          'border-amber-500/60 bg-amber-500/[0.04]',
        muted && !selected && 'opacity-40',
        dimmed && 'opacity-15',
      )}
      title={collapsed ? 'Collapsed — right-click to expand' : undefined}
    >
      <DescriptionPopover
        title={graphNode.block.name}
        description={description}
        visible={selected && showDescriptionPopover}
      />
      <NodeActions visible={selected}>{actions}</NodeActions>
      {startsFlows.length > 0 && (
        <span
          className="absolute -left-2 -top-2 flex size-4 items-center justify-center rounded-full border border-foreground/25 bg-background text-foreground"
          title={`Starts ${startsFlows.map((flow) => flow.name).join(', ')}`}
        >
          <Play className="size-2 fill-current" aria-hidden />
          <span className="sr-only">
            Starts {startsFlows.map((flow) => flow.name).join(', ')}
          </span>
        </span>
      )}
      <Handle
        type="target"
        position={Position.Top}
        className="!size-1.5 !border-background !bg-muted-foreground"
      />
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center',
          colors.icon,
          terminal?.icon,
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
            {graphNode.block.name}
          </span>
          {status && (
            <span
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-wide',
                status.className,
              )}
              aria-label={status.label}
            >
              <status.Icon className="size-2.5" aria-hidden />
              {status.label}
            </span>
          )}
        </span>
        {graphNode.block.kind === 'terminal' &&
          graphNode.block.completion?.kind === 'error' &&
          graphNode.block.completion.error !== undefined && (
            <span className="mt-1 block truncate text-[9px] text-rose-700 dark:text-rose-300">
              {graphNode.block.completion.error}
            </span>
          )}
        {hiddenNodeCount > 0 && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[8px] font-semibold text-primary">
            <ChevronsDownUp className="size-2.5" aria-hidden />
            {hiddenNodeCount} hidden
          </span>
        )}
      </span>
      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          '!size-1.5 !border-background !bg-muted-foreground',
          terminal && 'pointer-events-none opacity-0',
        )}
      />
    </div>
  );
}

export const progressiveNodeTypes = {
  'progressive-block': ProgressiveBlockNode,
};
