import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { ChevronRight, FolderClosed, Network } from 'lucide-react';
import { createContext, useContext } from 'react';

import { cn } from '#lib/utils';

import { moduleColors } from '../../laymos-modules/lib/colors';
import type {
  FocusModuleNodeData,
  TreeFolderNodeData,
  TreeLayerNodeData,
  TreeModuleNodeData,
} from '../lib/layout';

interface TreeInteraction {
  readonly focusedModule: string | null;
  readonly onFocusedModuleChange: (path: string | null) => void;
  readonly onOpenModule: (path: string) => void;
}

export const TreeInteractionContext = createContext<TreeInteraction | null>(
  null,
);

function TreeLayerNode({ data }: NodeProps<Node<TreeLayerNodeData>>) {
  const uncovered = Math.max(0, data.totalFiles - data.coveredFiles);
  return (
    <section
      className={cn(
        'h-full w-full overflow-hidden rounded-lg border border-border bg-card/95 shadow-sm transition-opacity',
        data.dimmed && 'opacity-25',
      )}
    >
      <header className="flex h-[58px] items-center justify-between gap-3 border-b border-border/70 bg-muted/25 px-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wider">
            {data.name}
          </p>
          <p className="truncate text-[9px] uppercase tracking-wide text-muted-foreground">
            {data.graphs.join(' · ') || 'No graph'}
          </p>
        </div>
        <div className="shrink-0 text-right text-[9px] tabular-nums text-muted-foreground">
          <p>{data.moduleCount} modules</p>
          <p
            style={uncovered ? { color: moduleColors.coverageGap } : undefined}
          >
            {data.coveredFiles}/{data.totalFiles} files
          </p>
        </div>
      </header>
    </section>
  );
}

function TreeFolderNode({ data }: NodeProps<Node<TreeFolderNodeData>>) {
  return (
    <div
      className={cn(
        'flex h-full items-center gap-1 text-[10px] font-medium text-muted-foreground transition-opacity',
        data.dimmed && 'opacity-25',
      )}
      style={{ paddingLeft: data.depth * 14 + 4 }}
    >
      <ChevronRight className="size-3 opacity-50" aria-hidden />
      <FolderClosed className="size-3 opacity-60" aria-hidden />
      <span className="truncate">{data.label}</span>
    </div>
  );
}

function NodeHandles() {
  return (
    <>
      <Handle
        id="target-left"
        type="target"
        position={Position.Left}
        className="!size-1.5 !border-background !bg-muted-foreground/60"
      />
      <Handle
        id="source-right"
        type="source"
        position={Position.Right}
        className="!size-1.5 !border-background !bg-muted-foreground/60"
      />
    </>
  );
}

function TreeModuleNode({ data }: NodeProps<Node<TreeModuleNodeData>>) {
  const interaction = useContext(TreeInteractionContext);
  return (
    <div
      className={cn(
        'relative flex h-full items-center transition-opacity',
        data.dimmed && 'opacity-15',
      )}
      style={{ paddingLeft: data.depth * 14 }}
    >
      <NodeHandles />
      <button
        type="button"
        className={cn(
          'nodrag nopan group flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border border-transparent px-2 text-left transition-colors hover:border-border hover:bg-muted/65',
          data.related && 'border-border/70 bg-muted/35',
          data.selected &&
            'border-primary bg-primary/10 ring-1 ring-primary/35',
          interaction?.focusedModule === data.path &&
            'outline-2 outline-ring outline-offset-1',
        )}
        onFocus={() => interaction?.onFocusedModuleChange(data.path)}
        onBlur={() => interaction?.onFocusedModuleChange(null)}
        aria-label={`${data.label} module in ${data.layer}. ${data.fileCount} files.`}
      >
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full bg-muted-foreground/45',
            data.violationCount > 0 && 'bg-destructive',
          )}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-[10px]">
          {data.label}
        </span>
        <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground/60">
          {data.fileCount}
        </span>
      </button>
      <button
        type="button"
        className="nodrag nopan ml-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-55 transition-all hover:bg-muted hover:text-foreground hover:opacity-100"
        onClick={(event) => {
          event.stopPropagation();
          interaction?.onOpenModule(data.path);
        }}
        aria-label={`Open connection graph for ${data.label}`}
        title="Open connection graph"
      >
        <Network className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

function FocusModuleNode({ data }: NodeProps<Node<FocusModuleNodeData>>) {
  return (
    <div
      className={cn(
        'relative flex h-full w-full flex-col justify-center rounded-lg border bg-background/95 px-3 shadow-sm',
        data.selected
          ? 'border-primary ring-2 ring-primary/40'
          : 'border-border',
      )}
    >
      <NodeHandles />
      <p className="truncate text-xs font-semibold">{data.label}</p>
      <p className="truncate text-[9px] uppercase tracking-wide text-muted-foreground">
        {data.layer}
        {data.distance > 0
          ? ` · ${data.distance} hop${data.distance === 1 ? '' : 's'}`
          : ''}
      </p>
      <p className="mt-1 text-[9px] tabular-nums text-muted-foreground">
        {data.fileCount} files
        {data.violationCount > 0 ? ` · ${data.violationCount} errors` : ''}
      </p>
    </div>
  );
}

export const treeNodeTypes = {
  'tree-layer': TreeLayerNode,
  'tree-folder': TreeFolderNode,
  'tree-module': TreeModuleNode,
};

export const focusNodeTypes = { 'focus-module': FocusModuleNode };
