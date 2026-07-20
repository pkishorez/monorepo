import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

import { cn } from '#lib/utils';

import { useModuleInteractions } from '../context/interaction-context';
import { moduleColors } from '../lib/colors';
import type { ModuleLayerNodeData, ModuleNodeData } from '../lib/layout';

function ModuleLayerNode({ data }: NodeProps<Node<ModuleLayerNodeData>>) {
  const uncovered = Math.max(0, data.totalFiles - data.coveredFiles);
  return (
    <section
      className={cn(
        'relative h-full w-full rounded-xl border border-border/80 bg-card/55 shadow-sm transition-opacity duration-150',
        data.dimmed && 'opacity-20',
      )}
      aria-label={`${data.name} layer, ${data.moduleCount} modules, ${uncovered} unassigned files`}
    >
      <Handle
        id="target-top"
        type="target"
        position={Position.Top}
        className="!opacity-0"
      />
      <Handle
        id="source-bottom"
        type="source"
        position={Position.Bottom}
        className="!opacity-0"
      />
      <header className="flex h-[68px] items-center justify-between gap-4 border-b border-border/60 px-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{data.name}</p>
          <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
            {data.graphs.join(' · ') || 'No graph'}
          </p>
        </div>
        <div className="shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
          <p>
            {data.moduleCount} {data.moduleCount === 1 ? 'module' : 'modules'}
          </p>
          <p
            style={
              uncovered > 0 ? { color: moduleColors.coverageGap } : undefined
            }
          >
            {data.coveredFiles}/{data.totalFiles} files
            {uncovered > 0 ? ` · ${uncovered} unassigned` : ''}
          </p>
        </div>
      </header>
    </section>
  );
}

function ModuleNode({ data }: NodeProps<Node<ModuleNodeData>>) {
  const interaction = useModuleInteractions(data.path);
  const handles = [
    [Position.Top, 'top'],
    [Position.Right, 'right'],
    [Position.Bottom, 'bottom'],
    [Position.Left, 'left'],
  ] as const;
  return (
    <div
      className={cn(
        'relative h-full w-full transition-opacity duration-150',
        data.dimmed && 'opacity-15',
      )}
    >
      {handles.flatMap(([position, side]) =>
        (['target', 'source'] as const).map((type) => (
          <Handle
            key={`${type}-${side}`}
            id={`${type}-${side}`}
            type={type}
            position={position}
            className="!opacity-0"
          />
        )),
      )}
      <button
        type="button"
        className={cn(
          'nodrag nopan flex h-full w-full flex-col justify-center rounded-lg border border-border bg-background/95 px-3 text-left text-foreground shadow-sm transition-all',
          data.fileCount === 0 && 'border-dashed text-muted-foreground',
          data.related && !data.selected && 'border-foreground/25 bg-muted/30',
          data.cyclic && 'ring-2 ring-violet-400/35',
          (interaction.hovered || data.comparison) &&
            'border-primary ring-2 ring-primary/30',
          interaction.focused && 'outline-2 outline-ring outline-offset-2',
          data.selected && 'border-primary ring-2 ring-primary/50 shadow-md',
        )}
        aria-label={`${data.label} module in ${data.layer}, ${data.fileCount} files${data.violationCount > 0 ? `, ${data.violationCount} violations` : ''}. Left click for direct connections, right click for transitive connections.`}
        onFocus={interaction.onFocus}
        onBlur={interaction.onBlur}
        onKeyDown={interaction.onKeyDown}
      >
        <span className="truncate text-xs font-semibold">{data.label}</span>
        <span className="flex gap-1 text-[10px] tabular-nums text-muted-foreground">
          {data.fileCount} {data.fileCount === 1 ? 'file' : 'files'}
          {data.violationCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="text-destructive">
                {data.violationCount}{' '}
                {data.violationCount === 1 ? 'error' : 'errors'}
              </span>
            </>
          )}
          {data.cyclic && (
            <>
              <span aria-hidden>·</span>
              <span style={{ color: moduleColors.cycle }}>cycle</span>
            </>
          )}
        </span>
      </button>
    </div>
  );
}

export const laymosModuleNodeTypes = {
  'module-layer': ModuleLayerNode,
  module: ModuleNode,
};
