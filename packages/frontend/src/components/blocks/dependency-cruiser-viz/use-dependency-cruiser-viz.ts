import { useMemo, useReducer } from 'react';

import { getFileTreeViewModel, type FileTreeViewModel } from './files';
import type { VisualizationConfig, VizSummary } from './model';

export type CanvasMode = 'layers' | 'features';

export type DependencyCruiserVizGraphView = {
  config: VisualizationConfig;
  summary?: VizSummary;
  activeLayer: string | null;
  selectedFeature: string | null;
  selectedModule: string | null;
  canvasMode: CanvasMode;
};

export type GraphHover = {
  /** Full folder path of the hovered module (e.g. `src/routes/otel/internal`). */
  modulePath: string;
  /** Full file paths belonging to the hovered module. */
  files: string[];
};

export type DependencyCruiserVizActions = {
  selectLayer: (layer: string | null) => void;
  hoverLayer: (layer: string | null) => void;
  selectFeature: (feature: string | null) => void;
  selectModule: (key: string | null) => void;
  hoverGraphModule: (hover: GraphHover | null) => void;
  setCanvasMode: (mode: CanvasMode) => void;
};

type State = {
  selectedLayer: string | null;
  hoveredLayer: string | null;
  selectedFeature: string | null;
  selectedModule: string | null;
  hoveredModule: GraphHover | null;
  canvasMode: CanvasMode;
};

type Action =
  | { type: 'select-layer'; layer: string | null }
  | { type: 'hover-layer'; layer: string | null }
  | { type: 'select-feature'; feature: string | null }
  | { type: 'select-module'; key: string | null }
  | { type: 'hover-graph-module'; hover: GraphHover | null }
  | { type: 'set-canvas-mode'; mode: CanvasMode };

const initialState: State = {
  selectedLayer: null,
  hoveredLayer: null,
  selectedFeature: null,
  selectedModule: null,
  hoveredModule: null,
  canvasMode: 'layers',
};

export function useDependencyCruiserViz({
  config,
  summary,
}: {
  config: VisualizationConfig;
  summary?: VizSummary;
}): {
  graph: DependencyCruiserVizGraphView;
  files: FileTreeViewModel | null;
  actions: DependencyCruiserVizActions;
} {
  const [state, dispatch] = useReducer(reducer, initialState);
  const activeLayer = state.selectedLayer ?? state.hoveredLayer;

  const graph = useMemo(
    () => ({
      config,
      summary,
      activeLayer,
      selectedFeature: state.selectedFeature,
      selectedModule: state.selectedModule,
      canvasMode: state.canvasMode,
    }),
    [
      activeLayer,
      config,
      state.selectedFeature,
      state.selectedModule,
      state.canvasMode,
      summary,
    ],
  );

  const hoveredGraphFilesSet = useMemo(
    () => (state.hoveredModule ? new Set(state.hoveredModule.files) : null),
    [state.hoveredModule],
  );

  const files = useMemo(
    () =>
      summary
        ? getFileTreeViewModel({
            config,
            summary,
            selectedLayer: activeLayer,
            selectedFeature: state.selectedFeature,
            selectedModule: state.selectedModule,
            hoveredGraphFiles: hoveredGraphFilesSet,
            hoveredModulePath: state.hoveredModule?.modulePath ?? null,
          })
        : null,
    [
      activeLayer,
      config,
      state.selectedFeature,
      state.selectedModule,
      hoveredGraphFilesSet,
      state.hoveredModule,
      summary,
    ],
  );

  const actions = useMemo<DependencyCruiserVizActions>(
    () => ({
      selectLayer: (layer) => dispatch({ type: 'select-layer', layer }),
      hoverLayer: (layer) => dispatch({ type: 'hover-layer', layer }),
      selectFeature: (feature) => dispatch({ type: 'select-feature', feature }),
      selectModule: (key) => dispatch({ type: 'select-module', key }),
      hoverGraphModule: (hover) =>
        dispatch({ type: 'hover-graph-module', hover }),
      setCanvasMode: (mode) => dispatch({ type: 'set-canvas-mode', mode }),
    }),
    [],
  );

  return { graph, files, actions };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'select-layer':
      return { ...state, selectedLayer: action.layer };
    case 'hover-layer':
      return { ...state, hoveredLayer: action.layer };
    case 'select-feature':
      return {
        ...state,
        selectedFeature: action.feature,
        selectedModule: null,
        canvasMode: 'features',
      };
    case 'select-module':
      return {
        ...state,
        selectedFeature: null,
        selectedModule: state.selectedModule === action.key ? null : action.key,
        canvasMode: 'features',
      };
    case 'hover-graph-module':
      return { ...state, hoveredModule: action.hover };
    case 'set-canvas-mode':
      return { ...state, canvasMode: action.mode };
  }
}
