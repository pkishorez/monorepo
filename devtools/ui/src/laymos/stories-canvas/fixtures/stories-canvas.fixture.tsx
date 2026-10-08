import type { ProofReport } from 'laymos/story/schema';

import { StoriesCanvas } from '../stories-canvas';
import { fixtureEvidenceUrl, proofReports, storyTree } from './fixture-data';
import { useSimulatedRun } from './simulated-run';

function Canvas({
  initial,
}: {
  readonly initial: Readonly<Record<string, ProofReport>>;
}) {
  const run = useSimulatedRun(storyTree, proofReports, initial);
  return (
    <StoriesCanvas
      tree={storyTree}
      reports={run.reports}
      running={run.running}
      onRun={run.onRun}
      evidenceUrl={fixtureEvidenceUrl}
      className="h-svh"
    />
  );
}

export default {
  'Saved reports': <Canvas initial={proofReports} />,
  'Never run': <Canvas initial={{}} />,
};
