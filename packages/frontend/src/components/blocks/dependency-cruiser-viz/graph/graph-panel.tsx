import { useReactFlow } from '@xyflow/react';
import { useCallback, useMemo } from 'react';

import { ResizablePanel } from '#components/ui/resizable';
import { cn } from '#lib/utils';

import { FEATURE_OVERVIEW } from '../files/file-tree-model';
import type {
  DependencyCruiserVizActions,
  DependencyCruiserVizGraphView,
} from '../use-dependency-cruiser-viz';
import { FeatureGraphPanel } from './feature-graph-panel';
import { LayerGraphPanel } from './layer-graph-panel';
import { FIT_VIEW_OPTIONS } from './react-flow-options';

type GraphPanelProps = {
  view: DependencyCruiserVizGraphView;
  actions: DependencyCruiserVizActions;
};

export function GraphPanel({ view, actions }: GraphPanelProps) {
  const { fitView } = useReactFlow();

  const handleResize = useCallback(() => {
    requestAnimationFrame(() => fitView(FIT_VIEW_OPTIONS));
  }, [fitView]);

  const featureGraph = useMemo(() => {
    if (
      !view.selectedFeature ||
      view.selectedFeature === FEATURE_OVERVIEW ||
      !view.summary?.featureGraphs
    )
      return null;
    return (
      view.summary.featureGraphs.find(
        (g) => g.feature === view.selectedFeature,
      ) ?? null
    );
  }, [view.selectedFeature, view.summary?.featureGraphs]);

  const showToggle = featureGraph !== null;
  const showFeatureGraph =
    view.graphMode === 'features' && featureGraph !== null;

  return (
    <ResizablePanel
      defaultSize={view.summary ? 70 : 100}
      minSize={40}
      onResize={handleResize}
    >
      <div className="relative h-full w-full">
        {showToggle && (
          <div className="absolute top-3 right-3 z-10 flex rounded-md border border-border bg-card shadow-sm">
            <ToggleButton
              active={view.graphMode === 'layers'}
              onClick={() => actions.setGraphMode('layers')}
            >
              Layers
            </ToggleButton>
            <ToggleButton
              active={view.graphMode === 'features'}
              onClick={() => actions.setGraphMode('features')}
            >
              Feature
            </ToggleButton>
          </div>
        )}

        {showFeatureGraph ? (
          <FeatureGraphPanel
            featureGraph={featureGraph}
            onHoverFiles={actions.hoverGraphFiles}
          />
        ) : (
          <LayerGraphPanel
            config={view.config}
            summary={view.summary}
            activeLayer={view.activeLayer}
            selectedFeature={view.selectedFeature}
            onSelectLayer={actions.selectLayer}
            onHoverLayer={actions.hoverLayer}
          />
        )}
      </div>
    </ResizablePanel>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1 text-xs font-medium transition-colors',
        'first:rounded-l-md last:rounded-r-md',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
