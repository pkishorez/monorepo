export type {
  Breach,
  DepcruiseVizData,
  LayerConflict,
  ModuleEdge,
  Visibility,
  VisualizationConfig,
  VizSummary,
} from './types';
export {
  VISIBILITY_COLOR,
  fileVisibility,
  moduleVisibilityByPath,
} from './visibility';
export {
  allModules,
  moduleFiles,
  moduleKey,
  resolveBreachModule,
  type ModuleNode,
} from './modules';
export { featureFiles, featureFileSets, featureFocus } from './features';
export {
  featureModuleGraph,
  type FeatureModuleGraph,
  type FeatureModuleGraphEdge,
} from './module-graph';
