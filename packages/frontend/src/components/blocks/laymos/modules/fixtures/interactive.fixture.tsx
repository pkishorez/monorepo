import {
  moduleDependencies,
  moduleLayerGraphs,
  moduleLayers,
  moduleRules,
  modules,
  moduleViolations,
} from './fixture-data';
import { ModulesExperience } from '../../experience';

export default (
  <ModulesExperience
    layers={moduleLayers}
    rules={moduleRules}
    layerGraphs={moduleLayerGraphs}
    modules={modules}
    dependencies={moduleDependencies}
    violations={moduleViolations}
    initialLayerId="application"
  />
);
