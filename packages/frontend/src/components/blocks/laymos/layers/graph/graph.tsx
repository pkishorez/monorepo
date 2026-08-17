import '@xyflow/react/dist/style.css';

import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import { useMemo } from 'react';

import { cn } from '#lib/utils';

import type {
  Layer,
  LayerInteraction,
  LayerRule,
  LayerViolationPair,
} from '../model';
import type { NamedLayerGraph } from '../layer-graphs';
import { layerEmptyState } from '../presentation';
import { graphIdentity } from '../../graph-engine';
import { selectedNodeClass } from '../../selection-presentation';
import {
  layoutGraph,
  type GraphHeaderNode,
  type GraphNode,
  type LaneGraphNode,
  type LayerGraphNode,
} from './layout';

interface LayerGraphProps extends LayerInteraction {
  readonly layers: readonly Layer[];
  readonly rules: readonly LayerRule[];
  readonly layerGraphs?: readonly NamedLayerGraph[];
  readonly activeLayerGraphId?: string;
  readonly isolatedLayerGraphId?: string;
  readonly showLayerConnections?: boolean;
  readonly onLayerGraphActivate?: (graphId: string) => void;
  readonly activeViolationPair?: LayerViolationPair;
  readonly onClearFocus?: () => void;
  readonly className?: string;
  readonly ariaLabel?: string;
}

const nodeTypes = {
  lane: LaneNode,
  'graph-header': GraphHeader,
  layer: LayerNode,
} satisfies NodeTypes;

export function LayerGraph(props: LayerGraphProps) {
  const identity = graphIdentity(props.layers, props.rules, props.layerGraphs);

  if (props.layers.length === 0) {
    return (
      <div
        className={cn(
          'grid h-96 w-full min-h-64 place-items-center rounded-lg border border-dashed border-border',
          props.className,
        )}
      >
        <p className={layerEmptyState}>No layers</p>
      </div>
    );
  }

  return (
    <ReactFlowProvider key={identity}>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}

function GraphCanvas(props: LayerGraphProps) {
  const layout = useMemo(() => layoutGraph(props), [props]);

  return (
    <div
      className={cn(
        'h-96 w-full min-h-64 overflow-hidden rounded-lg border border-border bg-background',
        props.className,
      )}
      aria-label={props.ariaLabel ?? 'Layer architecture'}
    >
      <ReactFlow<GraphNode>
        nodes={[...layout.nodes]}
        edges={[...layout.edges]}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.22, maxZoom: 1.25 }}
        minZoom={0.2}
        maxZoom={1.8}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          if (node.type === 'graph-header') {
            props.onLayerGraphActivate?.(node.id.slice('graph:'.length));
            return;
          }
          if (node.type !== 'layer') return;
          if (!node.data.activationEnabled) return;
          node.data.onHoverChange?.(undefined);
          node.data.onActivate?.(node.id);
        }}
        onNodeContextMenu={(event, node) => {
          if (node.type !== 'layer') return;
          if (!node.data.openEnabled) return;
          event.preventDefault();
          node.data.onHoverChange?.(undefined);
          node.data.onOpen?.(node.id);
        }}
        onPaneClick={() => {
          props.onLayerHoverChange?.(undefined);
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

function LaneNode({ data }: NodeProps<LaneGraphNode>) {
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
        id="source-bottom"
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
        )}
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

function LayerNode({ id, data }: NodeProps<LayerGraphNode>) {
  const hover = (layerId: string | undefined) => {
    if (data.hoverEnabled) data.onHoverChange?.(layerId);
  };

  return (
    <div
      className={cn(
        'h-full w-full transition-opacity',
        data.dimmed && 'opacity-10',
        data.softlyDimmed && 'opacity-10',
      )}
    >
      <DirectionalHandles />
      <button
        type="button"
        disabled={!data.activationEnabled}
        className={cn(
          'nodrag nopan grid h-full w-full place-items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-card-foreground shadow-sm outline-none transition-all',
          data.related && 'border-primary/70 bg-primary/5',
          data.focused && selectedNodeClass,
          data.violation &&
            'border-destructive bg-destructive/10 text-destructive ring-2 ring-destructive/25',
          data.activationEnabled &&
            !data.focused &&
            'cursor-pointer hover:border-primary/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
          data.activationEnabled && data.focused && 'cursor-pointer',
        )}
        onPointerEnter={() => hover(id)}
        onPointerLeave={() => hover(undefined)}
        onFocus={() => hover(id)}
        onBlur={() => hover(undefined)}
        onClick={(event) => {
          if (event.detail !== 0 || !data.activationEnabled) return;
          event.stopPropagation();
          data.onHoverChange?.(undefined);
          data.onActivate?.(id);
        }}
        onContextMenu={(event) => {
          if (!data.openEnabled) return;
          event.preventDefault();
          event.stopPropagation();
          data.onHoverChange?.(undefined);
          data.onOpen?.(id);
        }}
      >
        {data.label}
      </button>
    </div>
  );
}

function DirectionalHandles() {
  const horizontal = [
    { suffix: 'left', offset: 14 },
    { suffix: '', offset: '50%' },
    { suffix: 'right', offset: 'calc(100% - 14px)' },
  ] as const;

  return (
    <>
      {(['target', 'source'] as const).flatMap((type) =>
        ([Position.Top, Position.Bottom] as const).flatMap((position) =>
          horizontal.map(({ suffix, offset }) => {
            const side = position === Position.Top ? 'top' : 'bottom';
            return (
              <Handle
                key={`${type}-${side}-${suffix || 'center'}`}
                id={`${type}-${side}${suffix ? `-${suffix}` : ''}`}
                type={type}
                position={position}
                style={{ left: offset }}
                className="!size-1 !border-0 !bg-transparent"
              />
            );
          }),
        ),
      )}
      {(['target', 'source'] as const).flatMap((type) =>
        ([Position.Left, Position.Right] as const).map((position) => {
          const side = position === Position.Left ? 'left' : 'right';
          return (
            <Handle
              key={`${type}-${side}`}
              id={`${type}-${side}`}
              type={type}
              position={position}
              className="!size-1 !border-0 !bg-transparent"
            />
          );
        }),
      )}
    </>
  );
}
