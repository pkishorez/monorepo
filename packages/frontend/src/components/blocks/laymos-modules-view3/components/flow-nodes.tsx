import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Boxes } from 'lucide-react';
import { createContext, useContext } from 'react';

import { cn } from '#lib/utils';

import type { ModuleClusterNodeData, ModuleGraphNodeData } from '../lib/layout';

interface ModuleGraphInteraction {
  readonly focusedModule: string | null;
  readonly onFocusedModuleChange: (path: string | null) => void;
  readonly onExpandCluster: (clusterId: string) => void;
}

export const ModuleGraphInteractionContext =
  createContext<ModuleGraphInteraction | null>(null);

function NodeHandles() {
  return (
    <>
      <Handle
        id="target-top"
        type="target"
        position={Position.Top}
        className="!size-1.5 !border-background !bg-muted-foreground/65"
      />
      <Handle
        id="source-bottom"
        type="source"
        position={Position.Bottom}
        className="!size-1.5 !border-background !bg-muted-foreground/65"
      />
    </>
  );
}

function ModuleGraphNode({ data }: NodeProps<Node<ModuleGraphNodeData>>) {
  const interaction = useContext(ModuleGraphInteractionContext);
  return (
    <div
      className={cn(
        'relative h-full w-full rounded-md border bg-background/95 shadow-sm transition-all hover:border-foreground/35 hover:shadow-md',
        data.related ? 'border-border' : 'border-border/70',
        data.selected && 'border-primary ring-2 ring-primary/35',
        data.highlighted &&
          'z-10 border-foreground ring-2 ring-foreground/30 shadow-md',
        interaction?.focusedModule === data.path &&
          'outline-2 outline-ring outline-offset-1',
        data.muted && 'opacity-35',
        data.dimmed && 'opacity-15',
      )}
    >
      <NodeHandles />
      <button
        type="button"
        className="nodrag nopan flex h-full w-full min-w-0 items-center gap-2 px-2 text-left"
        onFocus={() => interaction?.onFocusedModuleChange(data.path)}
        onBlur={() => interaction?.onFocusedModuleChange(null)}
        title={`${data.path} · ${data.layer} · ${data.fileCount} files`}
        aria-label={`${data.label} module in ${data.layer}. ${data.fileCount} files.`}
      >
        <span
          className="size-2 shrink-0 rounded-full"
          style={{
            background: data.violationCount > 0 ? '#ef4444' : data.color,
          }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] font-medium">
          {data.label}
        </span>
        <span className="max-w-12 shrink-0 truncate text-[8px] text-muted-foreground">
          {data.layer}
        </span>
        {data.violationCount > 0 && (
          <span className="shrink-0 text-[9px] font-semibold text-destructive">
            {data.violationCount}
          </span>
        )}
      </button>
    </div>
  );
}

function ModuleClusterNode({ data }: NodeProps<Node<ModuleClusterNodeData>>) {
  const interaction = useContext(ModuleGraphInteractionContext);
  return (
    <div
      className={cn(
        'relative h-full w-full rounded-lg border border-dashed bg-muted/80 shadow-sm transition-all hover:border-foreground/40 hover:bg-muted hover:shadow-md',
        data.related && 'border-solid',
        data.selected && 'border-primary ring-2 ring-primary/35',
        data.muted && 'opacity-35',
        data.dimmed && 'opacity-15',
      )}
    >
      <NodeHandles />
      <button
        type="button"
        className="nodrag nopan flex h-full w-full items-center gap-2 px-2.5 text-left"
        onClick={(event) => {
          event.stopPropagation();
          interaction?.onExpandCluster(data.clusterId);
        }}
        title={`Expand ${data.modulePaths.length} ${data.layer} modules`}
        aria-label={`Expand ${data.modulePaths.length} modules in ${data.layer}`}
      >
        <Boxes className="size-3.5 shrink-0" style={{ color: data.color }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[10px] font-semibold">
            {data.label}
          </span>
          <span className="block truncate text-[8px] uppercase tracking-wide text-muted-foreground">
            {data.modulePaths.length} modules · {data.edgeCount} internal edges
          </span>
        </span>
      </button>
    </div>
  );
}

export const moduleGraphNodeTypes = {
  'module-graph': ModuleGraphNode,
  'module-cluster': ModuleClusterNode,
};
