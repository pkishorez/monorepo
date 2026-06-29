export { summarizeCruiseResult } from './analyze/index.js';
export { feature, layer, layersTopDown, module } from './authoring/index.js';
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
  ProjectConfig,
  Visibility,
  VisualizationConfig,
  VizSummary,
} from './types.js';
