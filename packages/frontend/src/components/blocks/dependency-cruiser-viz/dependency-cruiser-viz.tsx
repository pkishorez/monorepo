import {
  Background,
  ReactFlow,
  type Node,
  type NodeProps,
  Position,
  Handle,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo } from 'react';

import { cn } from '#lib/utils';

import { NODE_WIDTH, computeLayout, type LayerNodeData } from './layout';
import type { VisualizationConfig } from './types';

type Props = {
  config: VisualizationConfig;
};

function LayerNode({ data }: NodeProps<Node<LayerNodeData>>) {
  return (
    <>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <div
        style={{ width: NODE_WIDTH }}
        className={cn(
          'rounded-lg px-5 py-2 text-[13px] font-semibold text-center whitespace-nowrap',
          data.isEntry
            ? 'bg-primary text-primary-foreground'
            : 'bg-card text-card-foreground',
          data.isShared
            ? 'border-2 border-dashed border-muted-foreground'
            : 'border border-border',
        )}
      >
        {data.label}
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </>
  );
}

const nodeTypes = { layer: LayerNode };

export function DependencyCruiserViz({ config }: Props) {
  const { nodes, edges } = useMemo(() => computeLayout(config), [config]);

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.5 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="hsl(var(--border))" gap={20} />
      </ReactFlow>
    </div>
  );
}
