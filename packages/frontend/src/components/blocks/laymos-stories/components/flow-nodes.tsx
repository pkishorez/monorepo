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
  CircleDashed,
  GitBranch,
  XCircle,
} from 'lucide-react';
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
  if (!description) return null;
  return (
    <NodeToolbar
      isVisible={visible}
      position={Position.Right}
      align="center"
      offset={12}
      className="nodrag nopan nowheel"
    >
      <aside className="relative max-h-80 w-80 overflow-y-auto rounded-lg border border-border bg-popover p-4 text-left text-popover-foreground shadow-xl">
        <span className="absolute -left-1.5 top-1/2 size-3 -translate-y-1/2 rotate-45 border-b border-l border-border bg-popover" />
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
} as const;

const kindStyle = {
  flow: {
    node: 'border-violet-500/35 bg-background',
    icon: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
  step: {
    node: 'border-blue-500/35 bg-background',
    icon: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  decision: {
    node: 'border-amber-500/40 bg-background',
    icon: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
} as const;

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
  } = data;
  const collapsed = hiddenNodeCount > 0;
  if (graphNode.kind === 'arm') {
    const description = graphNode.arm.description;
    return (
      <div
        className={cn(
          'relative flex h-full w-full items-center justify-center rounded-full border border-amber-500/35 bg-amber-500/[0.07] px-3 text-center text-[9px] font-medium text-amber-700 transition-all duration-150 dark:text-amber-300',
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
        <Handle
          type="target"
          position={Position.Top}
          className="!size-1 !border-background !bg-amber-500"
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
          className="!size-1 !border-background !bg-amber-500"
        />
      </div>
    );
  }
  const Icon = kindIcon[graphNode.block.kind];
  const colors = kindStyle[graphNode.block.kind];
  const description = graphNode.block.description;
  const outcome = graphNode.visit?.outcome;
  const status =
    outcome === 'failed' && graphNode.expectedFailure
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
        'relative flex h-full w-full items-start gap-2.5 rounded-md border px-3 py-3 shadow-sm transition-all duration-150',
        'hover:border-primary/45 hover:shadow-md',
        colors.node,
        related && 'border-primary/55 bg-primary/[0.04]',
        hovered && 'border-primary shadow-md ring-2 ring-primary/20',
        selected &&
          'border-primary bg-primary/[0.07] shadow-lg ring-[3px] ring-primary/35',
        collapsed &&
          'cursor-context-menu border-primary/45 bg-primary/[0.04] shadow-md',
        outcome === 'failed' &&
          !graphNode.expectedFailure &&
          'border-destructive/70 bg-destructive/[0.04] shadow-destructive/10',
        ((outcome === 'failed' && graphNode.expectedFailure) ||
          outcome === 'interrupted') &&
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
      <Handle
        type="target"
        position={Position.Top}
        className="!size-1.5 !border-background !bg-muted-foreground"
      />
      <span
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded',
          colors.icon,
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
        className="!size-1.5 !border-background !bg-primary"
      />
    </div>
  );
}

export const progressiveNodeTypes = {
  'progressive-block': ProgressiveBlockNode,
};
