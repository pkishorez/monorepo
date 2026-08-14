import {
  complexCoverageViolations,
  complexLayerGraphs,
  complexLayers,
  complexRules,
  complexViolationPairs,
} from '../layers/fixtures/complex-fixture-data';
import {
  complexModuleDependencies,
  complexModules,
} from '../modules/fixtures/complex-fixture-data';
import { loadFixtureModuleSource } from '../modules/fixtures/fixture-data';
import { LaymosShell } from '../experience';

export default (
  <main className="min-h-screen bg-muted/20 p-3 sm:p-5">
    <LaymosShell
      className="mx-auto max-w-[1600px]"
      layers={complexLayers}
      rules={complexRules}
      layerGraphs={complexLayerGraphs}
      layerViolationPairs={complexViolationPairs}
      layerCoverageViolations={complexCoverageViolations}
      modules={complexModules}
      dependencies={complexModuleDependencies}
      loadModuleSource={loadFixtureModuleSource}
    />
  </main>
);
