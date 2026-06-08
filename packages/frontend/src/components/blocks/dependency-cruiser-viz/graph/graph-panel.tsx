import { cn } from '#lib/utils';

import { ResizablePanel } from '#components/ui/resizable';

import type { DependencyCruiserVizGraphView } from '../use-dependency-cruiser-viz';
import { FeatureGraphPanel } from './feature';
import { LayerGraphPanel } from './layer';

type GraphViewMode = 'layers' | 'features';

type GraphPanelProps = {
  view: DependencyCruiserVizGraphView;
  /** Toggles the shared `selectedFeature` state from the feature graph. */
  onSelectFeature: (feature: string | null) => void;
  /** Toggles the shared `selectedModule` state from the feature graph. */
  onSelectModule: (key: string | null) => void;
  /** Toggles the shared `selectedLayer` state from the layer graph. */
  onSelectLayer?: (layer: string | null) => void;
  /** Sets the hovered layer for the layer graph. */
  onHoverLayer?: (layer: string | null) => void;
  /** Manual override for the canvas tab (Layers | Features). */
  onSetCanvasMode: (mode: GraphViewMode) => void;
};

function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: GraphViewMode;
  onChange: (mode: GraphViewMode) => void;
}) {
  return (
    <div className="absolute left-3 top-3 z-10 flex rounded-md border border-border bg-background/80 p-0.5 shadow-sm backdrop-blur">
      {(['layers', 'features'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          className={cn(
            'rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors',
            mode === m
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

export function GraphPanel({
  view,
  onSelectFeature,
  onSelectModule,
  onSelectLayer,
  onHoverLayer,
  onSetCanvasMode,
}: GraphPanelProps) {
  const hasFeatures = (view.config.features ?? []).length > 0;

  return (
    <ResizablePanel defaultSize={view.summary ? 70 : 100} minSize={40}>
      <div className="relative h-full w-full">
        {hasFeatures && (
          <ViewModeToggle mode={view.canvasMode} onChange={onSetCanvasMode} />
        )}
        {view.canvasMode === 'features' && hasFeatures ? (
          <FeatureGraphPanel
            config={view.config}
            summary={view.summary}
            selectedFeature={view.selectedFeature}
            selectedModule={view.selectedModule}
            onSelectFeature={onSelectFeature}
            onSelectModule={onSelectModule}
          />
        ) : (
          <LayerGraphPanel
            config={view.config}
            summary={view.summary}
            activeLayer={view.activeLayer}
            onSelectLayer={onSelectLayer ?? (() => {})}
            onHoverLayer={onHoverLayer ?? (() => {})}
          />
        )}
      </div>
    </ResizablePanel>
  );
}
