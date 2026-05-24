import { Background, ReactFlow, type Node } from '@xyflow/react';
import { useCallback, useMemo } from 'react';
import type { MouseEvent } from 'react';

import type { VisualizationConfig, VizSummary } from '../types';
import { layerNodeTypes } from './graph-node-types';
import { computeLayerLayout } from './layer-layout';
import { FIT_VIEW_OPTIONS } from './react-flow-options';

type LayerGraphPanelProps = {
  config: VisualizationConfig;
  summary?: VizSummary;
  activeLayer: string | null;
  onSelectLayer: (layer: string | null) => void;
  onHoverLayer: (layer: string | null) => void;
};

export function LayerGraphPanel({
  config,
  summary,
  activeLayer,
  onSelectLayer,
  onHoverLayer,
}: LayerGraphPanelProps) {
  const { nodes, edges } = useMemo(
    () => computeLayerLayout(config, summary, activeLayer),
    [config, summary, activeLayer],
  );

  const handleNodeClick = useCallback(
    (_: MouseEvent, node: Node) => {
      if (node.type === 'layer') {
        onSelectLayer(node.id);
      }
    },
    [onSelectLayer],
  );

  const handlePaneClick = useCallback(() => {
    onSelectLayer(null);
  }, [onSelectLayer]);

  const handleNodeMouseEnter = useCallback(
    (_: MouseEvent, node: Node) => {
      if (node.type === 'layer') {
        onHoverLayer(node.id);
      }
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
