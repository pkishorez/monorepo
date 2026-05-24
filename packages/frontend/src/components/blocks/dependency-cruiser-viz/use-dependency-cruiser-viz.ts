import { useMemo, useReducer } from 'react';

import {
  getFileTreeViewModel,
  type FileTreeViewModel,
} from './files/file-tree-model';
import { getLayerPaths } from './model/selection-selectors';
import type { ViewMode, VisualizationConfig, VizSummary } from './types';

export type DependencyCruiserVizGraphView = {
  config: VisualizationConfig;
  summary?: VizSummary;
  viewMode: ViewMode;
  activeLayer: string | null;
  activeFeature: string | null;
  hasFeatures: boolean;
  hasSummary: boolean;
};

export type DependencyCruiserVizActions = {
  setViewMode: (viewMode: ViewMode) => void;
  selectLayer: (layer: string | null) => void;
  hoverLayer: (layer: string | null) => void;
  selectFeature: (feature: string | null) => void;
  hoverFeature: (feature: string | null) => void;
  hoverFeaturePath: (path: string | null) => void;
  toggleHideIrrelevant: () => void;
};

type DependencyCruiserVizState = {
  viewMode: ViewMode;
  selectedLayer: string | null;
  hoveredLayer: string | null;
  selectedFeature: string | null;
  hoveredFeature: string | null;
  hoveredFeaturePath: string | null;
  hideIrrelevantFiles: boolean;
};

type DependencyCruiserVizAction =
  | { type: 'set-view-mode'; viewMode: ViewMode }
  | { type: 'select-layer'; layer: string | null }
  | { type: 'hover-layer'; layer: string | null }
  | { type: 'select-feature'; feature: string | null }
  | { type: 'hover-feature'; feature: string | null }
  | { type: 'hover-feature-path'; path: string | null }
  | { type: 'toggle-hide-irrelevant' };

const initialState: DependencyCruiserVizState = {
  viewMode: 'layers',
  selectedLayer: null,
  hoveredLayer: null,
  selectedFeature: null,
  hoveredFeature: null,
  hoveredFeaturePath: null,
  hideIrrelevantFiles: true,
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
  const hasFeatures = (config.features ?? []).length > 0;
  const viewMode = hasFeatures ? state.viewMode : 'layers';
  const activeLayer = state.selectedLayer ?? state.hoveredLayer;
  const activeFeature = state.selectedFeature ?? state.hoveredFeature;
  const activeLayerPaths = useMemo(
    () => getLayerPaths(config, activeLayer),
    [activeLayer, config],
  );

  const graph = useMemo(
    () => ({
      config,
      summary,
      viewMode,
      activeLayer,
      activeFeature,
      hasFeatures,
      hasSummary: !!summary,
    }),
    [activeFeature, activeLayer, config, hasFeatures, summary, viewMode],
  );

  const files = useMemo(
    () =>
      summary
        ? getFileTreeViewModel({
            config,
            summary,
            viewMode,
            selectedLayer: activeLayer,
            selectedLayerPaths: activeLayerPaths,
            selectedFeature: activeFeature,
            hoveredFeaturePath: state.hoveredFeaturePath,
            hideIrrelevantFiles: state.hideIrrelevantFiles,
          })
        : null,
    [
      activeFeature,
      activeLayer,
      activeLayerPaths,
      config,
      state.hideIrrelevantFiles,
      state.hoveredFeaturePath,
      summary,
      viewMode,
    ],
  );

  const actions = useMemo<DependencyCruiserVizActions>(
    () => ({
      setViewMode: (nextViewMode) =>
        dispatch({ type: 'set-view-mode', viewMode: nextViewMode }),
      selectLayer: (layer) => dispatch({ type: 'select-layer', layer }),
      hoverLayer: (layer) => dispatch({ type: 'hover-layer', layer }),
      selectFeature: (feature) => dispatch({ type: 'select-feature', feature }),
      hoverFeature: (feature) => dispatch({ type: 'hover-feature', feature }),
      hoverFeaturePath: (path) =>
        dispatch({ type: 'hover-feature-path', path }),
      toggleHideIrrelevant: () => dispatch({ type: 'toggle-hide-irrelevant' }),
    }),
    [],
  );

  return { graph, files, actions };
}

function reducer(
  state: DependencyCruiserVizState,
  action: DependencyCruiserVizAction,
): DependencyCruiserVizState {
  switch (action.type) {
    case 'set-view-mode':
      return {
        ...state,
        viewMode: action.viewMode,
        selectedLayer: null,
        hoveredLayer: null,
        selectedFeature: null,
        hoveredFeature: null,
        hoveredFeaturePath: null,
      };
    case 'select-layer':
      return { ...state, selectedLayer: action.layer };
    case 'hover-layer':
      return { ...state, hoveredLayer: action.layer };
    case 'select-feature':
      return { ...state, selectedFeature: action.feature };
    case 'hover-feature':
      return { ...state, hoveredFeature: action.feature };
    case 'hover-feature-path':
      return { ...state, hoveredFeaturePath: action.path };
    case 'toggle-hide-irrelevant':
      return {
        ...state,
        hideIrrelevantFiles: !state.hideIrrelevantFiles,
      };
  }
}
