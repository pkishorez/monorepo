import { StoriesDocsSite } from '../../story-inspection';
import {
  storyReports,
  storyTree,
} from '../../story-inspection/fixtures/fixture-data';
import { useSimulatedRun } from '../../story-inspection/fixtures/simulated-run';

function Stories() {
  const run = useSimulatedRun(storyTree, storyReports);
  return (
    <main className="flex h-screen flex-col bg-muted/20 p-3 sm:p-5">
      <StoriesDocsSite
        tree={storyTree}
        reports={run.reports}
        running={run.running}
        onRun={run.onRun}
        className="mx-auto min-h-0 w-full max-w-[1400px] flex-1 rounded-xl border border-border bg-background shadow-sm"
      />
    </main>
  );
}

export default <Stories />;
