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
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleDotDashed,
  Info,
  Layers3,
} from '#lib/lucide';
import { cn } from '#lib/utils';

import { graphIdentity } from '../../graph-engine';
import type { NamedLayerGraph } from '../../layers/layer-graphs';
import type { Layer, LayerRule } from '../../layers/model';
import type { Module, ModuleDependency, ModuleViolation } from '../model';
import {
  layoutModuleGraph,
  type ConfiguredModuleNode,
  type GraphHeaderNode,
  type GraphLaneNode,
  type LayerContainerNode,
  type ModuleGraphNode,
  type NestedModuleNode,
  type UnassignedFileNode,
} from './layout';

interface ModuleGraphProps {
  readonly layers: readonly Layer[];
  readonly rules: readonly LayerRule[];
  readonly layerGraphs?: readonly NamedLayerGraph[];
  readonly modules: readonly Module[];
  readonly dependencies: readonly ModuleDependency[];
  readonly focusedLayerId?: string;
  readonly showLayerConnections: boolean;
  readonly activeModuleId?: string;
  readonly activeViolation?: ModuleViolation;
  readonly onModuleActivate?: (moduleId: string) => void;
  readonly onModuleOpen?: (moduleId: string) => void;
  readonly onLayerActivate?: (layerId: string) => void;
  readonly onClearFocus?: () => void;
  readonly className?: string;
}

const nodeTypes = {
  'module-graph-lane': GraphLane,
  'module-graph-header': GraphHeader,
  'module-layer': LayerContainer,
  module: ConfiguredModule,
  'nested-module': NestedModuleEntry,
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
          const nestedModuleId = (event.target as Element)
            .closest('.react-flow__node-nested-module')
            ?.getAttribute('data-id');
          if (nestedModuleId !== undefined && nestedModuleId !== null) {
            props.onModuleActivate?.(nestedModuleId);
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
          if (node.type !== 'module' && node.type !== 'nested-module') return;
          event.preventDefault();
          props.onModuleOpen?.(node.id);
        }}
        onNodeMouseEnter={(_, node) => {
          if (
            props.activeModuleId !== undefined &&
            props.activeViolation === undefined &&
            (node.type === 'module' || node.type === 'nested-module') &&
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
      className={cn(
        'h-full w-full cursor-pointer rounded-xl border border-border bg-muted/20 shadow-sm',
        data.focused && 'border-primary/50 bg-primary/[0.025]',
        data.dimmed && 'opacity-15',
        data.softlyDimmed && 'opacity-15',
        data.sharedAcrossGraphs &&
          'bg-[repeating-linear-gradient(135deg,transparent_0_9px,color-mix(in_oklab,var(--foreground)_4%,transparent)_9px_10px)]',
      )}
    >
      <Handle
        id="layer-target-top"
        type="target"
        position={Position.Top}
        className="!size-1.5 !border-0 !bg-transparent"
      />
      {data.targetHandles.map(({ id, offset }) => (
        <Handle
          key={id}
          id={id}
          type="target"
          position={Position.Top}
          className="!size-1.5 !border-0 !bg-transparent"
          style={{ left: `${offset}%` }}
        />
      ))}
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
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {data.moduleCount}
          </span>
        </div>
      </header>
    </section>
  );
}

function GraphLane(_: NodeProps<GraphLaneNode>) {
  return (
    <div
      className="h-full w-full rounded-xl border border-border/70 bg-card/20"
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
        className="flex h-full w-full flex-col justify-center rounded-md border border-border bg-background/95 px-3 shadow-sm"
        title={data.description}
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
  const Marker = kindMarker(data.kind);
  return (
    <article
      className={cn(
        'h-full w-full rounded-lg border bg-card shadow-sm',
        data.shared ? 'border-sky-500/50 bg-sky-500/[0.07]' : 'border-border',
        data.unexposed && 'border-dashed border-muted-foreground/60',
        data.related && 'border-primary/60',
        data.focused &&
          'border-[3px] border-primary ring-2 ring-primary/25 shadow-md',
        data.violation &&
          'border-destructive bg-destructive/10 ring-2 ring-destructive/25',
        data.dimmed && 'opacity-15',
        data.softlyDimmed && 'opacity-15',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-1.5 !border-0 !bg-transparent"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-1.5 !border-0 !bg-transparent"
      />
      <button
        type="button"
        className="nodrag nopan flex h-[58px] w-full items-center gap-2 rounded-lg px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
      >
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
          {data.label}
        </span>
        {data.shared && (
          <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
            Shared
          </span>
        )}
        {Marker !== undefined && (
          <Marker
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-label={`${data.kind} Module`}
          />
        )}
        {data.unexposed && (
          <Info
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-label="Unexposed Module"
          />
        )}
      </button>
    </article>
  );
}

function NestedModuleEntry({ id, data }: NodeProps<NestedModuleNode>) {
  return (
    <button
      type="button"
      className={cn(
        'nodrag nopan flex h-full w-full items-center rounded-md border border-border/80 bg-background px-2.5 text-left font-mono text-[10px] text-muted-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        data.related && 'border-primary/50 text-foreground',
        data.focused &&
          'border-2 border-primary bg-primary/5 text-primary ring-2 ring-primary/20',
        data.violation &&
          'border-2 border-destructive bg-destructive/10 text-destructive ring-2 ring-destructive/20',
        data.dimmed && 'opacity-15',
        data.softlyDimmed && 'opacity-15',
      )}
      onClick={() => data.onActivate?.(id)}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-1.5 !border-0 !bg-transparent"
      />
      <span className="truncate">{data.label}</span>
    </button>
  );
}

function UnassignedFile({ data }: NodeProps<UnassignedFileNode>) {
  return (
    <div className="grid h-full w-full place-items-center rounded-md border border-dashed border-destructive bg-destructive/5 px-3 font-mono text-[10px] text-destructive">
      <span className="truncate">{data.label}</span>
    </div>
  );
}

function kindMarker(kind: ConfiguredModuleNode['data']['kind']) {
  switch (kind) {
    case 'root':
      return ArrowUpFromLine;
    case 'terminal':
      return ArrowDownToLine;
    case 'isolated':
      return CircleDotDashed;
    case 'regular':
      return undefined;
  }
}
