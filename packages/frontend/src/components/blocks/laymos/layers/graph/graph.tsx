import '@xyflow/react/dist/style.css';

import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type EdgeTypes,
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
import { layerEmptyState } from '../presentation';
import { graphIdentity, layoutGraph, type GraphNode } from './layout';
import { RoutedEdge } from './routed-edge';

interface LayerGraphProps extends LayerInteraction {
  readonly layers: readonly Layer[];
  readonly rules: readonly LayerRule[];
  readonly activeViolationPair?: LayerViolationPair;
  readonly onClearFocus?: () => void;
  readonly className?: string;
  readonly ariaLabel?: string;
}

const nodeTypes = { layer: LayerNode } satisfies NodeTypes;
const edgeTypes = { routed: RoutedEdge } satisfies EdgeTypes;

export function LayerGraph(props: LayerGraphProps) {
  const identity = graphIdentity(props.layers, props.rules);

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
        edgeTypes={edgeTypes}
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
          if (!node.data.activationEnabled) return;
          node.data.onHoverChange?.(undefined);
          node.data.onActivate?.(node.id);
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

function LayerNode({ id, data }: NodeProps<GraphNode>) {
  const hover = (layerId: string | undefined) => {
    if (data.hoverEnabled) data.onHoverChange?.(layerId);
  };

  return (
    <div
      className={cn(
        'h-full w-full transition-opacity',
        data.dimmed && 'opacity-10',
      )}
    >
      <LayerHandles
        ids={data.incomingPortIds}
        type="target"
        position={Position.Top}
      />
      <LayerHandles
        ids={data.outgoingPortIds}
        type="source"
        position={Position.Bottom}
      />
      <button
        type="button"
        disabled={!data.activationEnabled}
        className={cn(
          'nodrag nopan grid h-full w-full place-items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-card-foreground shadow-sm outline-none transition-all',
          data.related && 'border-primary/70 bg-primary/5',
          data.focused &&
            'border-[3px] border-primary ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg',
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
      >
        {data.label}
      </button>
    </div>
  );
}

function LayerHandles({
  ids,
  type,
  position,
}: {
  readonly ids: readonly string[];
  readonly type: 'source' | 'target';
  readonly position: Position;
}) {
  return ids.map((id, index) => (
    <Handle
      key={id}
      id={id}
      type={type}
      position={position}
      className="!size-1 !border-0 !bg-transparent"
      style={{ left: `${((index + 1) / (ids.length + 1)) * 100}%` }}
    />
  ));
}
