import {
  moduleDependencies,
  moduleLayerGraphs,
  moduleLayers,
  moduleRules,
  modules,
  moduleViolations,
  loadFixtureModuleSource,
} from './fixture-data';
import { LaymosShell } from '../../experience';

export default (
  <LaymosShell
    layers={moduleLayers}
    rules={moduleRules}
    layerGraphs={moduleLayerGraphs}
    modules={modules}
    dependencies={moduleDependencies}
    moduleViolations={moduleViolations}
    loadModuleSource={loadFixtureModuleSource}
  />
);
