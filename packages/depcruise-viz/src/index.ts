export {
  assertGroupIsolation,
  detectCrossGroupEdges,
  summarizeCruiseResult,
} from './analyze/index.js';
export {
  feature,
  group,
  layer,
  layersTopDown,
  module,
} from './authoring/index.js';
export {
  toDependencyCruiserConfig,
  toVisualizationConfig,
} from './compile/index.js';
export type {
  Breach,
  BreachReason,
  DepcruiseVizData,
  FeatureEdge,
  FeatureModuleEdge,
  LayerConflict,
  LayerViolation,
  ModuleCoverage,
  ModuleEdge,
  ProjectConfig,
  Visibility,
  VisualizationConfig,
  VizSummary,
} from './types.js';
