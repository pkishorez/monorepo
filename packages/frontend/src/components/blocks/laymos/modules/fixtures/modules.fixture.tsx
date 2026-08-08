import {
  moduleDependencies,
  moduleLayerGraphs,
  moduleLayers,
  moduleRules,
  modules,
  moduleViolations,
  loadFixtureModuleSource,
} from './fixture-data';
import { ModulesExperience } from '../../experience';

const experience = (initialLayerId: string) => (
  <ModulesExperience
    layers={moduleLayers}
    rules={moduleRules}
    layerGraphs={moduleLayerGraphs}
    modules={modules}
    dependencies={moduleDependencies}
    violations={moduleViolations}
    initialLayerId={initialLayerId}
    loadModuleSource={loadFixtureModuleSource}
  />
);

export default {
  application: experience('application'),
  domain: experience('domain'),
  presentation: experience('presentation'),
};
