import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  type Node,
} from '@xyflow/react';
import { useCallback, useMemo, useRef } from 'react';
import type { MouseEvent } from 'react';

import { cn } from '#lib/utils';

import type { VisualizationConfig, VizSummary } from '../../model';
import { layerNodeTypes } from './layer-node-types';
import type { LayerNodeData } from './layer-layout';
import { computeLayerLayout } from './layer-layout';
import { FIT_VIEW_OPTIONS } from '../react-flow-options';
import { useFitViewOnResize } from '../use-fit-view-on-resize';

type LayerGraphPanelProps = {
  config: VisualizationConfig;
  summary?: VizSummary;
  activeLayer: string | null;
  onSelectLayer: (layer: string | null) => void;
  onHoverLayer: (layer: string | null) => void;
};

export function LayerGraphPanel(props: LayerGraphPanelProps) {
  return (
    <ReactFlowProvider>
      <LayerGraphPanelInner {...props} />
    </ReactFlowProvider>
  );
}

function LayerGraphPanelInner({
  config,
  summary,
  activeLayer,
  onSelectLayer,
  onHoverLayer,
}: LayerGraphPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitted = useFitViewOnResize(containerRef);

  const { nodes, edges } = useMemo(
    () => computeLayerLayout(config, summary, activeLayer),
    [config, summary, activeLayer],
  );

  const handleNodeClick = useCallback(
    (_: MouseEvent, node: Node) => {
      if (node.type !== 'layer') return;
      const data = node.data as LayerNodeData;
      if (data.isDimmed) return;
      onSelectLayer(data.layerName);
    },
    [onSelectLayer],
  );

  const handlePaneClick = useCallback(() => {
    onSelectLayer(null);
  }, [onSelectLayer]);

  const handleNodeMouseEnter = useCallback(
    (_: MouseEvent, node: Node) => {
      if (node.type !== 'layer') return;
      const data = node.data as LayerNodeData;
      if (data.isDimmed) return;
      onHoverLayer(data.layerName);
    },
    [onHoverLayer],
  );

  const handleNodeMouseLeave = useCallback(() => {
    onHoverLayer(null);
  }, [onHoverLayer]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'h-full w-full transition-opacity duration-150',
        fitted ? 'opacity-100' : 'opacity-0',
      )}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={layerNodeTypes}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnDoubleClick={false}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--border)" gap={20} />
      </ReactFlow>
    </div>
  );
}
