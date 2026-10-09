import { useState } from 'react';

import {
  loadFixtureFileContent,
  loadFixtureFileList,
} from '../../file-list/fixtures/fixture-files';
import {
  studioAnalysis,
  studioChanges,
} from '../../laymo/fixtures/studio-analysis';
import {
  fixtureEvidenceUrl,
  proofReports,
  storyTree,
} from '../../stories-canvas/fixtures/fixture-data';
import { useSimulatedRun } from '../../stories-canvas/fixtures/simulated-run';
import { Laymos } from '../analysis-explorer';

function Door() {
  const run = useSimulatedRun(storyTree, proofReports, proofReports);
  const [baseRef, setBaseRef] = useState('main');
  return (
    <Laymos
      analysis={studioAnalysis}
      changes={studioChanges}
      branches={[
        { name: 'main', remote: false, current: false },
        { name: 'ledger-on-expo', remote: false, current: true },
      ]}
      baseRef={baseRef}
      onBaseRefChange={setBaseRef}
      loadFileList={loadFixtureFileList}
      loadFileContent={loadFixtureFileContent}
      stories={{
        tree: storyTree,
        reports: run.reports,
        running: run.running,
        onRun: run.onRun,
        evidenceUrl: fixtureEvidenceUrl,
      }}
      className="h-svh"
    />
  );
}

export default {
  Laymos: <Door />,
};
