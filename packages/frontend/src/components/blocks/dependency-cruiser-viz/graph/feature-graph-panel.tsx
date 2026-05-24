import { Background, ReactFlow, type Node } from '@xyflow/react';
import { useCallback, useMemo } from 'react';
import type { MouseEvent } from 'react';

import type { VisualizationConfig, VizSummary } from '../types';
import {
  computeFeatureLayout,
  type FeatureHeaderNodeData,
  type FeaturePathNodeData,
} from './feature-layout';
import { featureNodeTypes } from './graph-node-types';
import { FIT_VIEW_OPTIONS } from './react-flow-options';

type FeatureGraphPanelProps = {
  config: VisualizationConfig;
  summary?: VizSummary;
  activeFeature: string | null;
  onSelectFeature: (feature: string | null) => void;
  onHoverFeature: (feature: string | null) => void;
  onHoverFeaturePath: (path: string | null) => void;
};

export function FeatureGraphPanel({
  config,
  summary,
  activeFeature,
  onSelectFeature,
  onHoverFeature,
  onHoverFeaturePath,
}: FeatureGraphPanelProps) {
  const { nodes, edges } = useMemo(
    () => computeFeatureLayout(config, summary, activeFeature),
    [config, summary, activeFeature],
  );

  const handleNodeClick = useCallback(
    (_: MouseEvent, node: Node) => {
      if (node.type === 'featureHeader') {
        const data = node.data as FeatureHeaderNodeData;
        onSelectFeature(data.featureName);
      }
    },
    [onSelectFeature],
  );

  const handlePaneClick = useCallback(() => {
    onSelectFeature(null);
  }, [onSelectFeature]);

  const handleNodeMouseEnter = useCallback(
    (_: MouseEvent, node: Node) => {
      if (node.type === 'featureHeader') {
        const data = node.data as FeatureHeaderNodeData;
        onHoverFeature(data.featureName);
        onHoverFeaturePath(null);
        return;
      }

      if (node.type === 'featurePath') {
        const data = node.data as FeaturePathNodeData;
        onHoverFeature(data.isShared ? null : (data.featureNames[0] ?? null));
        onHoverFeaturePath(data.path);
      }
    },
    [onHoverFeature, onHoverFeaturePath],
  );

  const handleNodeMouseLeave = useCallback(() => {
    onHoverFeature(null);
    onHoverFeaturePath(null);
  }, [onHoverFeature, onHoverFeaturePath]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={featureNodeTypes}
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
