import { useFixtureInput } from 'react-cosmos/client';
import type { LaymosStoriesReport } from 'laymos/report';

import { LaymosStories } from '../components/laymos-stories';
import type { LaymosStoriesRunState, LaymosStoriesSelection } from '../types';
import {
  checkoutStoryId,
  emptyStoriesFixtureReport,
  singleStoryFixtureReport,
  storiesFixtureReport,
  triageStoryId,
} from './reports';

function Controlled({
  report = storiesFixtureReport,
  storyIds = Object.keys(report.stories),
  runState = null,
  initialSelection = null,
}: {
  readonly report?: LaymosStoriesReport;
  readonly storyIds?: readonly string[];
  readonly runState?: LaymosStoriesRunState;
  readonly initialSelection?: LaymosStoriesSelection;
}) {
  const [selection, setSelection] = useFixtureInput<LaymosStoriesSelection>(
    'selection',
    initialSelection,
  );
  return (
    <div className="h-[880px] w-full min-w-[1040px] p-4">
      <LaymosStories
        storyIds={storyIds}
        report={report}
        runState={runState}
        selection={selection}
        onSelectionChange={setSelection}
        onRunStory={() => undefined}
        onRunAll={() => undefined}
      />
    </div>
  );
}

export default {
  'no story files': (
    <Controlled storyIds={[]} report={emptyStoriesFixtureReport} />
  ),
  'not run': (
    <Controlled
      storyIds={Object.keys(storiesFixtureReport.stories)}
      report={emptyStoriesFixtureReport}
    />
  ),
  'partially run': (
    <Controlled
      storyIds={Object.keys(storiesFixtureReport.stories)}
      report={singleStoryFixtureReport}
    />
  ),
  'running story': (
    <Controlled
      storyIds={Object.keys(storiesFixtureReport.stories)}
      report={emptyStoriesFixtureReport}
      runState={{ kind: 'story', storyId: checkoutStoryId }}
      initialSelection={{ kind: 'story', storyId: checkoutStoryId }}
    />
  ),
  'refreshing story': (
    <Controlled
      storyIds={Object.keys(storiesFixtureReport.stories)}
      report={storiesFixtureReport}
      runState={{ kind: 'story', storyId: checkoutStoryId }}
      initialSelection={{ kind: 'story', storyId: checkoutStoryId }}
    />
  ),
  'running all': (
    <Controlled report={storiesFixtureReport} runState={{ kind: 'all' }} />
  ),
  overview: <Controlled />,
  'unified flow': (
    <Controlled
      report={singleStoryFixtureReport}
      initialSelection={{ kind: 'story', storyId: checkoutStoryId }}
    />
  ),
  'parallel scenario flow': (
    <Controlled
      report={singleStoryFixtureReport}
      initialSelection={{
        kind: 'scenario',
        storyId: checkoutStoryId,
        scenarioIndex: 0,
      }}
    />
  ),
  'failed scenario flow': (
    <Controlled
      report={singleStoryFixtureReport}
      initialSelection={{
        kind: 'scenario',
        storyId: checkoutStoryId,
        scenarioIndex: 2,
      }}
    />
  ),
  'large decision tree story': (
    <Controlled initialSelection={{ kind: 'story', storyId: triageStoryId }} />
  ),
  'large decision tree scenario': (
    <Controlled
      initialSelection={{
        kind: 'scenario',
        storyId: triageStoryId,
        scenarioIndex: 0,
      }}
    />
  ),
};
