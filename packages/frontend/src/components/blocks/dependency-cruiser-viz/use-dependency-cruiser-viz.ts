import { useMemo, useReducer } from 'react';

import { getFileTreeViewModel, type FileTreeViewModel } from './files';
import type { ViolationItem } from './files/model/file-tree-types';
import type { VisualizationConfig, VizSummary } from './model';

export type CanvasMode = 'layers' | 'modules';

export type DependencyCruiserVizGraphView = {
  config: VisualizationConfig;
  summary?: VizSummary;
  selectedLayer: string | null;
  hoveredLayer: string | null;
  /** Module owning the graph (right-click); null renders the layer grid. */
  selectedModule: string | null;
  /** Module the file tree points at (left-click); independent of selection. */
  highlightedModule: string | null;
  selectedViolation: ViolationItem | null;
  canvasMode: CanvasMode;
};

export type GraphHover = {
  /** Module key (`layer::name`) of the hovered module. */
  key: string;
  /** Full folder path of the hovered module (e.g. `src/routes/otel/internal`). */
  modulePath: string;
  /** Full file paths belonging to the hovered module. */
  files: string[];
};

export type DependencyCruiserVizActions = {
  selectLayer: (layer: string | null) => void;
  hoverLayer: (layer: string | null) => void;
  highlightModule: (key: string | null) => void;
  selectModule: (key: string | null) => void;
  selectViolation: (violation: ViolationItem | null) => void;
  hoverGraphModule: (hover: GraphHover | null) => void;
  setCanvasMode: (mode: CanvasMode) => void;
};

type State = {
  selectedLayer: string | null;
  hoveredLayer: string | null;
  selectedModule: string | null;
  highlightedModule: string | null;
  selectedViolation: ViolationItem | null;
  hoveredModule: GraphHover | null;
  canvasMode: CanvasMode;
};

type Action =
  | { type: 'select-layer'; layer: string | null }
  | { type: 'hover-layer'; layer: string | null }
  | { type: 'highlight-module'; key: string | null }
  | { type: 'select-module'; key: string | null }
  | { type: 'select-violation'; violation: ViolationItem | null }
  | { type: 'hover-graph-module'; hover: GraphHover | null }
  | { type: 'set-canvas-mode'; mode: CanvasMode };

const initialState: State = {
  selectedLayer: null,
  hoveredLayer: null,
  selectedModule: null,
  highlightedModule: null,
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

  // Hover is a preview gesture: it only applies while nothing is selected.
  // With a selection (or violation) active, hovering other nodes is inert.
  const hoveredLayer =
    state.selectedLayer === null && state.selectedViolation === null
      ? state.hoveredLayer
      : null;
  const activeLayer = state.selectedLayer ?? hoveredLayer;

  const graph = useMemo(
    () => ({
      config,
      summary,
      selectedLayer: state.selectedLayer,
      hoveredLayer,
      selectedModule: state.selectedModule,
      highlightedModule: state.highlightedModule,
      selectedViolation: state.selectedViolation,
      canvasMode: state.canvasMode,
    }),
    [
      config,
      state.selectedLayer,
      hoveredLayer,
      state.selectedModule,
      state.highlightedModule,
      state.selectedViolation,
      state.canvasMode,
      summary,
    ],
  );

  const hoveredGraphFilesSet = useMemo(
    () => (state.hoveredModule ? new Set(state.hoveredModule.files) : null),
    [state.hoveredModule],
  );

  // Layer and module coverage are fully independent axes: the Layers tab only
  // ever highlights by layer, the Modules tab only by module. Neither selection
  // bleeds into the other tab's file coverage.
  const isModules = state.canvasMode === 'modules';

  const files = useMemo(
    () =>
      summary
        ? getFileTreeViewModel({
            config,
            summary,
            selectedLayer: isModules ? null : activeLayer,
            selectedModule: isModules ? state.selectedModule : null,
            // A hover preview collapses the tree exactly like a click
            // highlight. The graph panels gate hover behind explicit choices
            // (grid: none made; focus: highlight still equals selection), so
            // when a preview exists it is the intended tree pointer.
            highlightedModule: isModules
              ? (state.hoveredModule?.key ?? state.highlightedModule)
              : null,
            coverageMode: isModules ? 'modules' : 'layers',
            hoveredGraphFiles: hoveredGraphFilesSet,
            hoveredModulePath: state.hoveredModule?.modulePath ?? null,
          })
        : null,
    [
      activeLayer,
      config,
      isModules,
      state.selectedModule,
      state.highlightedModule,
      hoveredGraphFilesSet,
      state.hoveredModule,
      summary,
    ],
  );

  const actions = useMemo<DependencyCruiserVizActions>(
    () => ({
      selectLayer: (layer) => dispatch({ type: 'select-layer', layer }),
      hoverLayer: (layer) => dispatch({ type: 'hover-layer', layer }),
      highlightModule: (key) => dispatch({ type: 'highlight-module', key }),
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
    case 'highlight-module':
      // Left-click: point the file tree at a module without touching which
      // module owns the graph. Re-clicking the same module clears it.
      return {
        ...state,
        highlightedModule:
          state.highlightedModule === action.key ? null : action.key,
        selectedViolation: null,
        hoveredModule: null,
        canvasMode: 'modules',
      };
    case 'select-module':
      // Right-click: the module takes over the graph (radial focus view) and
      // pulls the highlight (file-tree pointer) along with it. Clearing the
      // selection (back to the grid) leaves the highlight where it was.
      return {
        ...state,
        selectedModule: action.key,
        highlightedModule: action.key ?? state.highlightedModule,
        selectedViolation: null,
        hoveredModule: null,
        canvasMode: 'modules',
      };
    case 'select-violation': {
      const isSame =
        action.violation !== null &&
        state.selectedViolation !== null &&
        sameViolation(state.selectedViolation, action.violation);
      return {
        ...state,
        selectedLayer: null,
        selectedModule: null,
        highlightedModule: null,
        selectedViolation: isSame ? null : action.violation,
        canvasMode: 'layers',
      };
    }
    case 'hover-graph-module':
      return { ...state, hoveredModule: action.hover };
    case 'set-canvas-mode':
      return {
        ...state,
        canvasMode: action.mode,
        selectedModule: action.mode === 'modules' ? state.selectedModule : null,
      };
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
