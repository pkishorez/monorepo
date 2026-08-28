import '@xyflow/react/dist/style.css';

import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import { useEffect, useMemo, useState } from 'react';
import { Layers3, Lock, Network, Share2 } from '@monorepo/frontend/lib/lucide';
import { cn } from '@monorepo/frontend/lib/utils';

import { ChangeBadge, changeSurfaceClass } from '../../project-changes';
import { graphIdentity } from '../../architecture-graph';
import {
  selectedContainerClass,
  selectedNodeClass,
} from '../../architecture-graph';
import type { NamedLayerGraph } from '../../analysis-presentation';
import type { Layer, LayerRule } from '../../analysis-presentation';
import type {
  Module,
  ModuleDependency,
  ModuleGraph,
  ModuleViolation,
} from '../../analysis-presentation';
import {
  layoutModuleGraph,
  type ConfiguredModuleNode,
  type GraphHeaderNode,
  type GraphLaneNode,
  type LayerContainerNode,
  type ModuleBandNode,
  type ModuleGraphNode,
  type UnassignedFileNode,
} from './layout';

interface ModuleGraphProps {
  readonly layers: readonly Layer[];
  readonly rules: readonly LayerRule[];
  readonly layerGraphs?: readonly NamedLayerGraph[];
  readonly activeLayerGraphId?: string;
  readonly isolatedLayerGraphId?: string;
  readonly modules: readonly Module[];
  readonly moduleGraphs?: readonly ModuleGraph[];
  readonly dependencies: readonly ModuleDependency[];
  readonly focusedLayerId?: string;
  readonly showLayerConnections: boolean;
  readonly showModuleConnections?: boolean;
  readonly activeModuleId?: string;
  readonly activeViolation?: ModuleViolation;
  readonly onModuleActivate?: (moduleId: string) => void;
  readonly onModuleOpen?: (moduleId: string) => void;
  readonly onModuleGraphOpen?: (graphId: string) => void;
  readonly onLayerActivate?: (layerId: string) => void;
  readonly onLayerOpen?: (layerId: string) => void;
  readonly onLayerGraphActivate?: (graphId: string) => void;
  readonly onLayerGraphOpen?: (graphId: string) => void;
  readonly onClearFocus?: () => void;
  readonly className?: string;
}

const nodeTypes = {
  'module-graph-lane': GraphLane,
  'module-graph-header': GraphHeader,
  'module-layer': LayerContainer,
  'module-band': ModuleBand,
  module: ConfiguredModule,
  'unassigned-file': UnassignedFile,
} satisfies NodeTypes;

export function ModuleGraph(props: ModuleGraphProps) {
  const identity = JSON.stringify([
    graphIdentity(props.layers, props.rules, props.layerGraphs),
    props.modules.map(({ id }) => id),
  ]);
  return (
    <ReactFlowProvider key={identity}>
      <ModuleGraphCanvas {...props} />
    </ReactFlowProvider>
  );
}

function ModuleGraphCanvas(props: ModuleGraphProps) {
  const [hoveredModuleId, setHoveredModuleId] = useState<string>();
  const layout = useMemo(
    () => layoutModuleGraph({ ...props, hoveredModuleId }),
    [props, hoveredModuleId],
  );
  const reactFlow = useReactFlow<ModuleGraphNode>();
  const visibleNodes = layout.nodes.map(({ id }) => id).join('\0');

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void reactFlow.fitView({ padding: 0.16, maxZoom: 1.05, duration: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [reactFlow, visibleNodes]);

  useEffect(() => setHoveredModuleId(undefined), [props.activeModuleId]);

  return (
    <div
      className={cn(
        'h-96 w-full min-h-64 overflow-hidden rounded-lg border border-border bg-background',
        props.className,
      )}
      aria-label="Module architecture"
    >
      <ReactFlow<ModuleGraphNode>
        nodes={[...layout.nodes]}
        edges={[...layout.edges]}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.16, maxZoom: 1.05 }}
        minZoom={0.12}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(event, node) => {
          setHoveredModuleId(undefined);
          if (node.type === 'module-graph-header') {
            props.onLayerGraphActivate?.(
              node.id.slice('module-graph-header:'.length),
            );
            return;
          }
          const moduleId = (event.target as Element)
            .closest('.react-flow__node-module')
            ?.getAttribute('data-id');
          if (moduleId !== undefined && moduleId !== null) {
            props.onModuleActivate?.(moduleId);
            return;
          }
          if (node.type === 'module-layer') props.onLayerActivate?.(node.id);
        }}
        onNodeContextMenu={(event, node) => {
          if (node.type === 'module') {
            event.preventDefault();
            props.onModuleOpen?.(node.id);
            return;
          }
          if (node.type === 'module-band') {
            event.preventDefault();
            props.onModuleGraphOpen?.(node.id.slice('module-band:'.length));
            return;
          }
          if (node.type === 'module-layer') {
            if (props.onLayerOpen === undefined) return;
            event.preventDefault();
            props.onLayerOpen(node.id);
            return;
          }
          if (node.type === 'module-graph-header') {
            if (props.onLayerGraphOpen === undefined) return;
            event.preventDefault();
            props.onLayerGraphOpen(
              node.id.slice('module-graph-header:'.length),
            );
          }
        }}
        onNodeMouseEnter={(_, node) => {
          if (
            props.activeModuleId !== undefined &&
            props.activeViolation === undefined &&
            node.type === 'module' &&
            node.data.related
          ) {
            setHoveredModuleId(node.id);
          }
        }}
        onNodeMouseLeave={() => setHoveredModuleId(undefined)}
        onPaneClick={() => {
          setHoveredModuleId(undefined);
          props.onClearFocus?.();
        }}
      >
        <Background
          className="opacity-40"
          color="var(--border)"
          gap={28}
          size={1}
        />
        <Controls
          showInteractive={false}
          className="!border-border !bg-background !shadow-sm [&>button]:!border-border [&>button]:!bg-background [&>button]:!fill-foreground"
        />
      </ReactFlow>
    </div>
  );
}

function LayerContainer({ data }: NodeProps<LayerContainerNode>) {
  return (
    <section
      title={
        data.openable ? "Right-click to explore this Layer's source" : undefined
      }
      className={cn(
        'h-full w-full cursor-pointer rounded-xl border border-border bg-muted/20 shadow-sm',
        changeSurfaceClass(data.changeStatus),
        data.focused && selectedContainerClass,
        data.dimmed && 'opacity-15',
        data.softlyDimmed && 'opacity-15',
        data.openable && 'cursor-context-menu',
      )}
    >
      <Handle
        id="layer-target-top"
        type="target"
        position={Position.Top}
        className="!size-1.5 !border-0 !bg-transparent"
      />
      <Handle
        id="layer-source-bottom"
        type="source"
        position={Position.Bottom}
        className="!size-1.5 !border-0 !bg-transparent"
      />
      <header className="flex h-[52px] items-center gap-3 border-b border-border/80 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Layers3 className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-semibold">{data.label}</span>
          {data.changeStatus !== undefined && (
            <ChangeBadge status={data.changeStatus} />
          )}
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {data.moduleCount}
          </span>
        </div>
      </header>
    </section>
  );
}

function GraphLane({ data }: NodeProps<GraphLaneNode>) {
  return (
    <div
      className={cn(
        'h-full w-full rounded-xl border border-border/70 bg-card/20 transition-opacity',
        data.dimmed && 'opacity-20',
      )}
      aria-hidden
    />
  );
}

function GraphHeader({ data }: NodeProps<GraphHeaderNode>) {
  return (
    <div className="relative h-full w-full">
      <Handle
        id="graph-source-bottom"
        type="source"
        position={Position.Bottom}
        className="!size-1 !border-0 !bg-transparent"
      />
      <div
        className={cn(
          'flex h-full w-full flex-col justify-center rounded-md border border-border bg-background/95 px-3 shadow-sm transition-all',
          data.active && 'border-primary/70 bg-primary/5 text-foreground',
          data.dimmed && 'opacity-25',
          data.activatable && 'cursor-pointer hover:border-primary/60',
          data.openable && 'cursor-context-menu',
        )}
        title={
          data.openable
            ? "Right-click to explore this LayerGraph's source"
            : data.description
        }
      >
        <span className="truncate text-xs font-bold uppercase tracking-wider">
          {data.label}
        </span>
        {data.description !== undefined && (
          <span className="truncate text-[10px] text-muted-foreground">
            {data.description}
          </span>
        )}
      </div>
    </div>
  );
}

function ConfiguredModule({ data }: NodeProps<ConfiguredModuleNode>) {
  return (
    <article
      title={`${data.label} — ${visibilityLabel(data)}`}
      className={cn(
        'h-full w-full rounded-lg border border-border bg-card shadow-sm',
        !data.shared &&
          !data.exposed &&
          'border-dashed border-muted-foreground/50',
        changeSurfaceClass(data.changeStatus),
        data.related && 'border-primary/60',
        data.focused && selectedNodeClass,
        data.violation &&
          'border-destructive bg-destructive/10 ring-2 ring-destructive/25',
        data.dimmed && 'opacity-15',
        data.softlyDimmed && 'opacity-15',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className={cn(
          '!size-1.5 !border-0',
          // An anchor only when this box is an endpoint, so an edge that merely
          // passes behind it stays visibly unattached.
          data.related || data.focused ? '!bg-primary' : '!bg-transparent',
        )}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          '!size-1.5 !border-0',
          data.related || data.focused ? '!bg-primary' : '!bg-transparent',
        )}
      />
      <button
        type="button"
        className="nodrag nopan flex h-[58px] w-full items-center gap-2 rounded-lg px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
      >
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
          {data.label}
        </span>
        {data.changeStatus !== undefined && (
          <ChangeBadge status={data.changeStatus} />
        )}
        <VisibilityMark shared={data.shared} exposed={data.exposed} />
      </button>
    </article>
  );
}

function ModuleBand({ data }: NodeProps<ModuleBandNode>) {
  return (
    <div
      title="Right-click to explore this Module Graph's source"
      className={cn(
        'h-full w-full cursor-context-menu rounded-xl border border-dashed border-border bg-muted/10',
        data.violation && 'border-destructive bg-destructive/5',
        data.dimmed && 'opacity-20',
      )}
    >
      <div className="flex items-center gap-2 px-3 pt-2 text-muted-foreground">
        <Network className="size-3 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">
          {data.label}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums">
          {data.memberCount}
        </span>
      </div>
    </div>
  );
}

function UnassignedFile({ data }: NodeProps<UnassignedFileNode>) {
  return (
    <div className="grid h-full w-full place-items-center rounded-md border border-dashed border-destructive bg-destructive/5 px-3 font-mono text-[10px] text-destructive">
      <span className="truncate">{data.label}</span>
    </div>
  );
}

// Exposed is the default on almost every Module, so only the exceptions are
// marked: Shared, and importable-by-nobody.
function VisibilityMark({
  shared,
  exposed,
}: {
  readonly shared: boolean;
  readonly exposed: boolean;
}) {
  if (shared) {
    return (
      <Share2
        className="size-3.5 shrink-0 text-foreground"
        aria-label="Shared within its Layer"
      />
    );
  }
  if (!exposed) {
    return (
      <Lock
        className="size-3.5 shrink-0 text-muted-foreground/60"
        aria-label="Private"
      />
    );
  }
  return null;
}

function visibilityLabel(data: ConfiguredModuleNode['data']): string {
  if (data.shared && data.exposed) return 'Shared and exposed';
  if (data.shared) return 'Shared within its Layer';
  if (data.exposed) return 'Exposed to other Layers';
  return data.member ? 'Private Module Graph member' : 'Private';
}
