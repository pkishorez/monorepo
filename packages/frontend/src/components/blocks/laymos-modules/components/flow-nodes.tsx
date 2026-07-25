import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

import { cn } from '#lib/utils';

import { useModuleGraphInteraction } from '../context/interaction-context';
import type {
  GraphHeaderNodeData,
  GraphLaneNodeData,
  GroupContainerNodeData,
  GroupNodeData,
  LayerContainerNodeData,
  ModuleTileNodeData,
} from '../lib/layout';

function GraphLaneNode({ data }: NodeProps<Node<GraphLaneNodeData>>) {
  return (
    <div
      className={cn(
        'h-full w-full rounded-xl border border-transparent bg-transparent transition-opacity',
        data.dimmed && 'opacity-35',
      )}
      aria-hidden
    />
  );
}

function GraphHeaderNode({ data }: NodeProps<Node<GraphHeaderNodeData>>) {
  const uncovered = Math.max(0, data.totalFiles - data.coveredFiles);
  return (
    <div className={cn('relative h-full w-full', data.dimmed && 'opacity-30')}>
      <Handle
        id="source-bottom"
        type="source"
        position={Position.Bottom}
        className="!pointer-events-none !opacity-0"
      />
      <div
        className="pointer-events-auto flex h-full w-full items-center rounded-md border border-border/75 bg-background/80 px-3 text-left text-muted-foreground shadow-sm"
        title={
          data.sharedLayerCount > 0
            ? `Right-click to ${data.expanded ? 'minimise' : 'maximise'}. Also affects ${data.sharedLayerCount} shared ${data.sharedLayerCount === 1 ? 'layer' : 'layers'}.`
            : `Right-click to ${data.expanded ? 'minimise' : 'maximise'}.`
        }
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold uppercase tracking-wider">
            {data.name}
          </span>
          <span className="block truncate text-[9px] tabular-nums text-muted-foreground">
            {data.layerCount} layers · {data.moduleCount} modules
            {uncovered > 0 ? ` · ${uncovered} uncovered` : ''}
            {data.violationCount > 0 ? ` · ${data.violationCount} errors` : ''}
          </span>
        </span>
      </div>
    </div>
  );
}

function LayerHandles() {
  return (
    <>
      <Handle
        id="target-top"
        type="target"
        position={Position.Top}
        className="!pointer-events-none !opacity-0"
      />
      <Handle
        id="source-bottom"
        type="source"
        position={Position.Bottom}
        className="!pointer-events-none !opacity-0"
      />
    </>
  );
}

function LayerContainerNode({ data }: NodeProps<Node<LayerContainerNodeData>>) {
  const shared = data.graphCount > 1;
  return (
    <section
      className={cn(
        'relative w-full overflow-hidden rounded-xl border border-dashed border-border/55 bg-background text-foreground shadow-inner transition-all',
        data.expanded ? 'h-full' : 'h-[66px]',
        data.containsSelected && 'border-primary/55 ring-1 ring-primary/20',
        data.related && !data.containsSelected && 'border-border/80',
        data.dimmed && 'opacity-30',
      )}
    >
      <span
        className="pointer-events-none absolute inset-0 bg-muted/20"
        aria-hidden
      />
      <LayerHandles />
      {shared && (
        <span
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg, transparent 0 8px, color-mix(in oklab, var(--foreground) 5%, transparent) 8px 9px)',
          }}
          aria-hidden
        />
      )}
      <div
        className={cn(
          'pointer-events-auto relative z-10 flex h-[66px] w-full items-center bg-background/25 px-4 text-left',
          data.expanded && 'border-b border-border/50',
        )}
        title={`Right-click to ${data.expanded ? 'minimise' : 'maximise'} ${data.name}`}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{data.name}</span>
          </span>
          <span className="flex flex-wrap gap-x-1 text-[10px] tabular-nums text-muted-foreground">
            <span>{data.moduleCount} modules</span>
            <span aria-hidden>·</span>
            <span>{data.fileCount} files</span>
            {shared && (
              <>
                <span aria-hidden>·</span>
                <span>{data.graphCount} graphs</span>
              </>
            )}
            {data.violationCount > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="text-destructive">
                  {data.violationCount} errors
                </span>
              </>
            )}
            {data.hiddenConnectionCount > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="font-medium text-primary">
                  {data.hiddenConnectionCount} connected inside
                </span>
              </>
            )}
          </span>
        </span>
      </div>
      {data.expanded && data.moduleCount === 0 && (
        <p className="relative z-10 px-4 py-4 text-xs text-muted-foreground">
          No modules configured
        </p>
      )}
    </section>
  );
}

function GroupNode({ data }: NodeProps<Node<GroupNodeData>>) {
  const interaction = useModuleGraphInteraction();
  const title = data.description
    ? `${data.name} — ${data.description}`
    : data.name;

  return (
    <div
      className={cn(
        'relative h-full w-full transition-all duration-150',
        data.dimmed && 'opacity-20 saturate-50',
      )}
    >
      <ModuleHandles />
      <span
        className="pointer-events-none absolute -right-1 -top-1 bottom-1 left-1 rounded-md border border-border/70 bg-card"
        aria-hidden
      />
      <button
        type="button"
        className={cn(
          'pointer-events-auto relative flex h-full w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-border/80 bg-card px-2.5 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-foreground/70 hover:shadow-md focus-visible:outline-none',
          data.related &&
            'border-sky-500/55 bg-sky-500/[0.09] shadow-[inset_3px_0_0_#38bdf8]',
          data.violationCount > 0 && 'border-destructive/60',
        )}
        title={`${title} — click to expand ${data.moduleCount} modules`}
        aria-label={`${data.name} group, ${data.moduleCount} modules${data.violationCount > 0 ? `, ${data.violationCount} violations` : ''}, click to expand`}
        aria-expanded={false}
        onMouseEnter={() => interaction.onHoveredGroupChange(data.name)}
        onMouseLeave={() => interaction.onHoveredGroupChange(null)}
        onClick={(event) => {
          event.stopPropagation();
          interaction.onToggleGroup(data.name);
        }}
      >
        <span
          className={cn(
            'flex size-3.5 shrink-0 items-center justify-center rounded-sm border border-border text-[8px] leading-none text-muted-foreground',
            data.violationCount > 0 && 'border-destructive text-destructive',
          )}
          aria-hidden
        >
          ▸
        </span>
        <span className="min-w-0 flex-1 break-words text-[10px] font-semibold leading-tight">
          {data.name}
        </span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 text-[9px] font-medium tabular-nums text-muted-foreground">
          {data.moduleCount}
        </span>
      </button>
    </div>
  );
}

function GroupContainerNode({ data }: NodeProps<Node<GroupContainerNodeData>>) {
  const interaction = useModuleGraphInteraction();
  const title = data.description
    ? `${data.name} — ${data.description}`
    : data.name;

  return (
    <section
      className={cn(
        'relative h-full w-full rounded-lg border border-border/70 bg-muted/25 shadow-inner transition-opacity',
        data.related && 'border-sky-500/50 bg-sky-500/[0.05]',
        data.dimmed && 'opacity-30',
      )}
      aria-label={`${data.name} group`}
    >
      <header className="flex h-7 w-full items-center gap-2 px-2.5">
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full bg-foreground/40',
            data.violationCount > 0 && 'bg-destructive',
          )}
          aria-hidden
        />
        <span
          className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
          title={title}
        >
          {data.name}
        </span>
        <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground/70">
          {data.moduleCount}
          {data.violationCount > 0 ? (
            <span className="text-destructive"> · {data.violationCount}</span>
          ) : null}
        </span>
        <button
          type="button"
          className="pointer-events-auto flex size-4 shrink-0 items-center justify-center rounded border border-border bg-background/80 text-[9px] leading-none text-muted-foreground hover:border-foreground/70 hover:text-foreground focus-visible:outline-none"
          title={`Minimise ${data.name}`}
          aria-label={`Minimise ${data.name} group`}
          onClick={(event) => {
            event.stopPropagation();
            interaction.onToggleGroup(data.name);
          }}
        >
          –
        </button>
      </header>
      {data.bands.map((band) => (
        <span
          key={band.label}
          className="pointer-events-none absolute inset-x-2.5 border-t border-border/50"
          style={{ top: band.top }}
          aria-hidden
        />
      ))}
    </section>
  );
}

function ModuleHandles() {
  return (
    <>
      <Handle
        id="target-top"
        type="target"
        position={Position.Top}
        className="!pointer-events-none !opacity-0"
      />
      <Handle
        id="source-bottom"
        type="source"
        position={Position.Bottom}
        className="!pointer-events-none !opacity-0"
      />
    </>
  );
}

function ModuleTileNode({ data }: NodeProps<Node<ModuleTileNodeData>>) {
  const interaction = useModuleGraphInteraction();
  const visual = {
    selected: data.selected,
    related: data.related,
    dimmed: data.dimmed,
  };
  const hovered = interaction.hoveredModule === data.path;
  const focused = interaction.focusedModule === data.path;
  const previewed = hovered || focused;
  return (
    <div
      className={cn(
        'relative h-full w-full transition-all duration-150',
        visual.dimmed && 'opacity-20 saturate-50',
      )}
    >
      <ModuleHandles />
      <button
        type="button"
        className={cn(
          'pointer-events-auto relative flex h-full w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-border/80 bg-card px-2.5 text-left shadow-sm transition-all duration-150 focus-visible:outline-none',
          data.isRoot &&
            'border-sky-500/35 bg-sky-500/[0.05] dark:border-sky-400/30 dark:bg-sky-400/[0.08]',
          data.isSink &&
            'border-emerald-500/35 bg-emerald-500/[0.05] dark:border-emerald-400/30 dark:bg-emerald-400/[0.08]',
          visual.related &&
            !visual.selected &&
            'border-sky-500/55 bg-sky-500/[0.09] shadow-[inset_3px_0_0_#38bdf8]',
          !data.quiet &&
            !visual.selected &&
            !visual.dimmed &&
            'hover:-translate-y-0.5 hover:border-foreground/70 hover:bg-accent hover:shadow-md hover:ring-2 hover:ring-foreground/10',
          previewed &&
            !visual.selected &&
            !visual.dimmed &&
            '-translate-y-0.5 border-foreground/70 bg-accent shadow-md ring-2 ring-foreground/15',
          focused &&
            !visual.selected &&
            !visual.dimmed &&
            'border-ring ring-2 ring-ring/55 ring-offset-1 ring-offset-background',
          visual.selected &&
            'border-primary bg-primary/15 shadow-md ring-[3px] ring-primary/45 ring-offset-1 ring-offset-background',
        )}
        title={`${data.path}${data.isRoot ? ' · Root module' : ''}${data.isSink ? ' · Sink module' : ''}${data.description ? ` — ${data.description}` : ''}`}
        aria-label={`${data.label} module in ${data.layer}${data.isRoot ? ', root module' : ''}${data.isSink ? ', sink module' : ''}, ${data.fileCount} files${data.violationCount > 0 ? `, ${data.violationCount} violations` : ''}`}
        onMouseEnter={() => interaction.onHoveredModuleChange(data.path)}
        onMouseLeave={() => interaction.onHoveredModuleChange(null)}
        onClick={(event) => {
          event.stopPropagation();
          interaction.onSelectedModuleChange(
            interaction.selectedModule?.path === data.path &&
              interaction.selectedModule.depth === 'direct'
              ? null
              : { path: data.path, depth: 'direct' },
          );
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          interaction.onSelectedModuleChange({
            path: data.path,
            depth: 'transitive',
          });
        }}
        onFocus={() => interaction.onFocusedModuleChange(data.path)}
        onBlur={() => interaction.onFocusedModuleChange(null)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            interaction.onSelectedModuleChange(null);
            return;
          }
          if (
            event.key === 'ContextMenu' ||
            (event.shiftKey && event.key === 'F10')
          ) {
            event.preventDefault();
            interaction.onSelectedModuleChange({
              path: data.path,
              depth: 'transitive',
            });
          }
        }}
      >
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full bg-muted-foreground/40',
            data.isRoot && 'bg-sky-500',
            data.isSink && 'bg-emerald-500',
            data.violationCount > 0 && 'bg-destructive',
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 break-words font-mono text-[10px] font-medium leading-tight">
          {data.label}
        </span>
      </button>
    </div>
  );
}

export const moduleGraphNodeTypes = {
  'module-graph-lane': GraphLaneNode,
  'module-graph-header': GraphHeaderNode,
  'module-group': GroupNode,
  'module-group-container': GroupContainerNode,
  'module-layer-container': LayerContainerNode,
  'module-tile': ModuleTileNode,
};
