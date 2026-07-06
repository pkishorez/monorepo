import { cn } from '#lib/utils';

import { ResizablePanel } from '#components/ui/resizable';

import type {
  CanvasMode,
  DependencyCruiserVizGraphView,
  GraphHover,
} from '../use-dependency-cruiser-viz';
import { ModulesPanel } from './modules';
import { LayerGraphPanel } from './layer';

type GraphPanelProps = {
  view: DependencyCruiserVizGraphView;
  /** Toggles the shared `highlightedModule` state from the modules canvas. */
  onHighlightModule: (key: string | null) => void;
  /** Selects a module for the radial view (null returns to the grid). */
  onSelectModule: (key: string | null) => void;
  /** Toggles the shared `selectedLayer` state from the layer graph. */
  onSelectLayer?: (layer: string | null) => void;
  /** Sets the hovered layer for the layer graph. */
  onHoverLayer?: (layer: string | null) => void;
  /** Previews a hovered module's files in the file tree. */
  onHoverGraphModule?: (hover: GraphHover | null) => void;
  /** Manual override for the canvas tab. */
  onSetCanvasMode: (mode: CanvasMode) => void;
};

const TAB_LABELS: Record<CanvasMode, string> = {
  layers: 'Layers',
  modules: 'Modules',
};

function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: CanvasMode;
  onChange: (mode: CanvasMode) => void;
}) {
  const tabs: CanvasMode[] = ['layers', 'modules'];
  return (
    <div className="absolute left-3 top-3 z-10 flex rounded-md border border-border bg-background/80 p-0.5 shadow-sm backdrop-blur">
      {tabs.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          className={cn(
            'rounded px-2.5 py-1 text-xs font-medium transition-colors',
            mode === m
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {TAB_LABELS[m]}
        </button>
      ))}
    </div>
  );
}

export function GraphPanel({
  view,
  onHighlightModule,
  onSelectModule,
  onSelectLayer,
  onHoverLayer,
  onHoverGraphModule,
  onSetCanvasMode,
}: GraphPanelProps) {
  const hasModules = (view.config.modules ?? []).length > 0;

  return (
    <ResizablePanel defaultSize={view.summary ? 70 : 100} minSize={40}>
      <div className="relative h-full w-full">
        {hasModules && (
          <ViewModeToggle mode={view.canvasMode} onChange={onSetCanvasMode} />
        )}
        {view.canvasMode === 'modules' && hasModules ? (
          <div className="h-full w-full pt-10">
            <ModulesPanel
              config={view.config}
              summary={view.summary}
              selectedModule={view.selectedModule}
              highlightedModule={view.highlightedModule}
              onSelectModule={onSelectModule}
              onHighlightModule={onHighlightModule}
              onHoverGraphModule={onHoverGraphModule}
            />
          </div>
        ) : (
          <LayerGraphPanel
            config={view.config}
            summary={view.summary}
            selectedLayer={view.selectedLayer}
            hoveredLayer={view.hoveredLayer}
            selectedViolation={view.selectedViolation}
            onSelectLayer={onSelectLayer ?? (() => {})}
            onHoverLayer={onHoverLayer ?? (() => {})}
          />
        )}
      </div>
    </ResizablePanel>
  );
}
