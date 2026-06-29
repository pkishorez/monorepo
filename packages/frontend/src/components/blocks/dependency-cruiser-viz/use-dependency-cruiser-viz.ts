import { useMemo, useReducer } from 'react';

import { getFileTreeViewModel, type FileTreeViewModel } from './files';
import type { ViolationItem } from './files/model/file-tree-types';
import type { VisualizationConfig, VizSummary } from './model';

export type CanvasMode = 'layers' | 'features';

export type DependencyCruiserVizGraphView = {
  config: VisualizationConfig;
  summary?: VizSummary;
  selectedLayer: string | null;
  hoveredLayer: string | null;
  selectedFeature: string | null;
  selectedModule: string | null;
  selectedViolation: ViolationItem | null;
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
  selectViolation: (violation: ViolationItem | null) => void;
  hoverGraphModule: (hover: GraphHover | null) => void;
  setCanvasMode: (mode: CanvasMode) => void;
};

type State = {
  selectedLayer: string | null;
  hoveredLayer: string | null;
  selectedFeature: string | null;
  selectedModule: string | null;
  selectedViolation: ViolationItem | null;
  hoveredModule: GraphHover | null;
  canvasMode: CanvasMode;
};

type Action =
  | { type: 'select-layer'; layer: string | null }
  | { type: 'hover-layer'; layer: string | null }
  | { type: 'select-feature'; feature: string | null }
  | { type: 'select-module'; key: string | null }
  | { type: 'select-violation'; violation: ViolationItem | null }
  | { type: 'hover-graph-module'; hover: GraphHover | null }
  | { type: 'set-canvas-mode'; mode: CanvasMode };

const initialState: State = {
  selectedLayer: null,
  hoveredLayer: null,
  selectedFeature: null,
  selectedModule: null,
  selectedViolation: null,
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
      selectedLayer: state.selectedLayer,
      hoveredLayer: state.hoveredLayer,
      selectedFeature: state.selectedFeature,
      selectedModule: state.selectedModule,
      selectedViolation: state.selectedViolation,
      canvasMode: state.canvasMode,
    }),
    [
      config,
      state.selectedLayer,
      state.hoveredLayer,
      state.selectedFeature,
      state.selectedModule,
      state.selectedViolation,
      state.canvasMode,
      summary,
    ],
  );

  const hoveredGraphFilesSet = useMemo(
    () => (state.hoveredModule ? new Set(state.hoveredModule.files) : null),
    [state.hoveredModule],
  );

  // Layer and feature coverage are fully independent axes: the Layers tab only
  // ever highlights by layer, the Features tab only by feature/module. Neither
  // selection bleeds into the other tab's file coverage.
  const isFeatures = state.canvasMode === 'features';

  const files = useMemo(
    () =>
      summary
        ? getFileTreeViewModel({
            config,
            summary,
            selectedLayer: isFeatures ? null : activeLayer,
            selectedFeature: isFeatures ? state.selectedFeature : null,
            selectedModule: isFeatures ? state.selectedModule : null,
            coverageMode: isFeatures ? 'features' : 'layers',
            hoveredGraphFiles: hoveredGraphFilesSet,
            hoveredModulePath: state.hoveredModule?.modulePath ?? null,
          })
        : null,
    [
      activeLayer,
      config,
      isFeatures,
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
      selectViolation: (violation) =>
        dispatch({ type: 'select-violation', violation }),
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
      return { ...state, selectedLayer: action.layer, selectedViolation: null };
    case 'hover-layer':
      return { ...state, hoveredLayer: action.layer };
    case 'select-feature':
      return {
        ...state,
        selectedFeature: action.feature,
        selectedModule: null,
        selectedViolation: null,
        canvasMode: 'features',
      };
    case 'select-module':
      return {
        ...state,
        selectedFeature: null,
        selectedModule: state.selectedModule === action.key ? null : action.key,
        selectedViolation: null,
        canvasMode: 'features',
      };
    case 'select-violation': {
      const isSame =
        action.violation !== null &&
        state.selectedViolation !== null &&
        sameViolation(state.selectedViolation, action.violation);
      return {
        ...state,
        selectedLayer: null,
        selectedFeature: null,
        selectedModule: null,
        selectedViolation: isSame ? null : action.violation,
        canvasMode: 'layers',
      };
    }
    case 'hover-graph-module':
      return { ...state, hoveredModule: action.hover };
    case 'set-canvas-mode':
      return { ...state, canvasMode: action.mode };
  }
}

function sameViolation(a: ViolationItem, b: ViolationItem): boolean {
  return (
    a.from === b.from &&
    a.to === b.to &&
    a.fromFile === b.fromFile &&
    a.toFile === b.toFile
  );
}
