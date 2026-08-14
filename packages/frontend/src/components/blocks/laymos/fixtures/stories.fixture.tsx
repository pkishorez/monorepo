import { StoriesDocsSite } from '../stories/docs-site';
import { storyReports, storyTree } from '../stories/fixtures/fixture-data';
import { useSimulatedRun } from '../stories/fixtures/simulated-run';

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
