import { useMemo, useReducer } from 'react';

import {
  getFileTreeViewModel,
  type FileTreeViewModel,
} from './files/file-tree-model';
import { getLayerPaths } from './model/selection-selectors';
import type { VisualizationConfig, VizSummary } from './types';

export type DependencyCruiserVizGraphView = {
  config: VisualizationConfig;
  summary?: VizSummary;
  activeLayer: string | null;
  selectedFeature: string | null;
  graphMode: 'layers' | 'features';
};

export type DependencyCruiserVizActions = {
  selectLayer: (layer: string | null) => void;
  hoverLayer: (layer: string | null) => void;
  selectFeature: (feature: string | null) => void;
  setGraphMode: (mode: 'layers' | 'features') => void;
  hoverGraphFiles: (files: string[] | null) => void;
};

type State = {
  selectedLayer: string | null;
  hoveredLayer: string | null;
  selectedFeature: string | null;
  graphMode: 'layers' | 'features';
  hoveredGraphFiles: string[] | null;
};

type Action =
  | { type: 'select-layer'; layer: string | null }
  | { type: 'hover-layer'; layer: string | null }
  | { type: 'select-feature'; feature: string | null }
  | { type: 'set-graph-mode'; mode: 'layers' | 'features' }
  | { type: 'hover-graph-files'; files: string[] | null };

const initialState: State = {
  selectedLayer: null,
  hoveredLayer: null,
  selectedFeature: null,
  graphMode: 'layers',
  hoveredGraphFiles: null,
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
  const activeLayerPaths = useMemo(
    () => getLayerPaths(config, activeLayer),
    [activeLayer, config],
  );

  const graph = useMemo(
    () => ({
      config,
      summary,
      activeLayer,
      selectedFeature: state.selectedFeature,
      graphMode: state.graphMode,
    }),
    [activeLayer, config, state.selectedFeature, state.graphMode, summary],
  );

  const hoveredGraphFilesSet = useMemo(
    () => (state.hoveredGraphFiles ? new Set(state.hoveredGraphFiles) : null),
    [state.hoveredGraphFiles],
  );

  const files = useMemo(
    () =>
      summary
        ? getFileTreeViewModel({
            config,
            summary,
            selectedLayer: activeLayer,
            selectedLayerPaths: activeLayerPaths,
            selectedFeature: state.selectedFeature,
            hoveredGraphFiles: hoveredGraphFilesSet,
          })
        : null,
    [
      activeLayer,
      activeLayerPaths,
      config,
      state.selectedFeature,
      hoveredGraphFilesSet,
      summary,
    ],
  );

  const actions = useMemo<DependencyCruiserVizActions>(
    () => ({
      selectLayer: (layer) => dispatch({ type: 'select-layer', layer }),
      hoverLayer: (layer) => dispatch({ type: 'hover-layer', layer }),
      selectFeature: (feature) => dispatch({ type: 'select-feature', feature }),
      setGraphMode: (mode) => dispatch({ type: 'set-graph-mode', mode }),
      hoverGraphFiles: (files) =>
        dispatch({ type: 'hover-graph-files', files }),
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
      return { ...state, selectedFeature: action.feature };
    case 'set-graph-mode':
      return { ...state, graphMode: action.mode };
    case 'hover-graph-files':
      return { ...state, hoveredGraphFiles: action.files };
  }
}
