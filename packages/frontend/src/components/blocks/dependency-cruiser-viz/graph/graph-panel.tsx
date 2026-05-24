import { useReactFlow } from '@xyflow/react';
import { useCallback } from 'react';

import { ResizablePanel } from '#components/ui/resizable';

import type {
  DependencyCruiserVizActions,
  DependencyCruiserVizGraphView,
} from '../use-dependency-cruiser-viz';
import { FeatureGraphPanel } from './feature-graph-panel';
import { LayerGraphPanel } from './layer-graph-panel';
import { FIT_VIEW_OPTIONS } from './react-flow-options';
import { ViewToggle } from './view-toggle';

type GraphPanelProps = {
  view: DependencyCruiserVizGraphView;
  actions: DependencyCruiserVizActions;
};

export function GraphPanel({ view, actions }: GraphPanelProps) {
  const { fitView } = useReactFlow();

  const handleResize = useCallback(() => {
    requestAnimationFrame(() => fitView(FIT_VIEW_OPTIONS));
  }, [fitView]);

  return (
    <ResizablePanel
      defaultSize={view.hasSummary ? 70 : 100}
      minSize={40}
      onResize={handleResize}
    >
      <div className="relative h-full w-full">
        <ViewToggle
          viewMode={view.viewMode}
          onViewModeChange={actions.setViewMode}
          hasFeatures={view.hasFeatures}
        />
        {view.viewMode === 'layers' ? (
          <LayerGraphPanel
            config={view.config}
            summary={view.summary}
            activeLayer={view.activeLayer}
            onSelectLayer={actions.selectLayer}
            onHoverLayer={actions.hoverLayer}
          />
        ) : (
          <FeatureGraphPanel
            config={view.config}
            summary={view.summary}
            activeFeature={view.activeFeature}
            onSelectFeature={actions.selectFeature}
            onHoverFeature={actions.hoverFeature}
            onHoverFeaturePath={actions.hoverFeaturePath}
          />
        )}
      </div>
    </ResizablePanel>
  );
}
