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
};

export type DependencyCruiserVizActions = {
  selectLayer: (layer: string | null) => void;
  hoverLayer: (layer: string | null) => void;
  selectFeature: (feature: string | null) => void;
};

type State = {
  selectedLayer: string | null;
  hoveredLayer: string | null;
  selectedFeature: string | null;
};

type Action =
  | { type: 'select-layer'; layer: string | null }
  | { type: 'hover-layer'; layer: string | null }
  | { type: 'select-feature'; feature: string | null };

const initialState: State = {
  selectedLayer: null,
  hoveredLayer: null,
  selectedFeature: null,
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
    }),
    [activeLayer, config, state.selectedFeature, summary],
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
          })
        : null,
    [activeLayer, activeLayerPaths, config, state.selectedFeature, summary],
  );

  const actions = useMemo<DependencyCruiserVizActions>(
    () => ({
      selectLayer: (layer) => dispatch({ type: 'select-layer', layer }),
      hoverLayer: (layer) => dispatch({ type: 'hover-layer', layer }),
      selectFeature: (feature) => dispatch({ type: 'select-feature', feature }),
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
  }
}
