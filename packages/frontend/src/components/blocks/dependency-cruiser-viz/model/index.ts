export type {
  DepcruiseVizData,
  FeatureClosureViolation,
  LayerConflict,
  ModuleEdge,
  VisualizationConfig,
  VizSummary,
} from './types';
export { allModules, moduleFiles, moduleKey, type ModuleNode } from './modules';
export {
  featureFiles,
  featureFileSets,
  featureFocus,
  type FeatureFocus,
} from './features';
export { featureRules, type FeatureRules } from './feature-rules';
export {
  featureModuleGraph,
  moduleFamily,
  type FeatureModuleGraph,
  type FeatureModuleGraphEdge,
} from './module-graph';
