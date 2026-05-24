import { Background, ReactFlow, type Node } from '@xyflow/react';
import { useCallback, useMemo } from 'react';
import type { MouseEvent } from 'react';

import type { VisualizationConfig, VizSummary } from '../types';
import { layerNodeTypes } from './graph-node-types';
import type { LayerNodeData } from './layer-layout';
import { computeLayerLayout } from './layer-layout';
import { FIT_VIEW_OPTIONS } from './react-flow-options';

type LayerGraphPanelProps = {
  config: VisualizationConfig;
  summary?: VizSummary;
  activeLayer: string | null;
  selectedFeature: string | null;
  onSelectLayer: (layer: string | null) => void;
  onHoverLayer: (layer: string | null) => void;
};

export function LayerGraphPanel({
  config,
  summary,
  activeLayer,
  selectedFeature,
  onSelectLayer,
  onHoverLayer,
}: LayerGraphPanelProps) {
  const { nodes, edges } = useMemo(
    () => computeLayerLayout(config, summary, activeLayer, selectedFeature),
    [config, summary, activeLayer, selectedFeature],
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
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={layerNodeTypes}
      fitView
      fitViewOptions={FIT_VIEW_OPTIONS}
      nodesDraggable={false}
      nodesConnectable={false}
      onNodeClick={handleNodeClick}
      onPaneClick={handlePaneClick}
      onNodeMouseEnter={handleNodeMouseEnter}
      onNodeMouseLeave={handleNodeMouseLeave}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="hsl(var(--border))" gap={20} />
    </ReactFlow>
  );
}
