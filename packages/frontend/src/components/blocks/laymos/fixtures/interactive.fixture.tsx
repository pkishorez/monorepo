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
import { storyReports, storyTree } from '../stories/fixtures/fixture-data';
import { useSimulatedRun } from '../stories/fixtures/simulated-run';
import { LaymosShell } from '../experience';
import {
  fixtureChangeIndex,
  loadFixtureFileDiff,
  withChangeStatus,
  withLayerChangeStatus,
} from './change-fixture-data';

const changedModules = withChangeStatus(complexModules);
const changedLayers = withLayerChangeStatus(complexLayers, changedModules);

function Interactive() {
  const run = useSimulatedRun(storyTree, storyReports);
  return (
    <LaymosShell
      className="mx-auto max-w-[1600px]"
      layers={changedLayers}
      rules={complexRules}
      layerGraphs={complexLayerGraphs}
      layerViolationPairs={complexViolationPairs}
      layerCoverageViolations={complexCoverageViolations}
      modules={changedModules}
      dependencies={complexModuleDependencies}
      loadModuleSource={loadFixtureModuleSource}
      loadFileDiff={loadFixtureFileDiff}
      changes={fixtureChangeIndex}
      stories={{
        tree: storyTree,
        reports: run.reports,
        running: run.running,
        onRun: run.onRun,
      }}
    />
  );
}

export default (
  <main className="min-h-screen bg-muted/20 p-3 sm:p-5">
    <Interactive />
  </main>
);
