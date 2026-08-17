import {
  moduleDependencies,
  moduleLayerGraphs,
  moduleLayers,
  moduleRules,
  moduleGraphs,
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
    moduleGraphs={moduleGraphs}
    dependencies={moduleDependencies}
    moduleViolations={moduleViolations}
    loadModuleSource={loadFixtureModuleSource}
  />
);
