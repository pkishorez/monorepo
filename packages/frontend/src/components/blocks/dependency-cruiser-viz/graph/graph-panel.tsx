import { useReactFlow } from '@xyflow/react';
import { useCallback } from 'react';

import { ResizablePanel } from '#components/ui/resizable';

import type {
  DependencyCruiserVizActions,
  DependencyCruiserVizGraphView,
} from '../use-dependency-cruiser-viz';
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

  return (
    <ResizablePanel
      defaultSize={view.summary ? 70 : 100}
      minSize={40}
      onResize={handleResize}
    >
      <LayerGraphPanel
        config={view.config}
        summary={view.summary}
        activeLayer={view.activeLayer}
        selectedFeature={view.selectedFeature}
        onSelectLayer={actions.selectLayer}
        onHoverLayer={actions.hoverLayer}
      />
    </ResizablePanel>
  );
}
