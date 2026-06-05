export type {
  DepcruiseVizData,
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
  resolveBreachModule,
  type ModuleNode,
} from './modules';
export { featureFiles, featureFileSets, featureFocus } from './features';
