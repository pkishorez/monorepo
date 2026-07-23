import { useFixtureInput } from 'react-cosmos/client';
import type { StoriesRun, StoryCatalog, StoryCollection } from 'laymos/report';

import { LaymosStories } from '../components/laymos-stories';
import type { LaymosStoriesRunState, LaymosStoriesSelection } from '../types';
import {
  checkoutStoryId,
  emptyStoriesFixtureCatalog,
  emptyStoriesFixtureReport,
  projectNarrativeFixture,
  singleStoryFixtureReport,
  storiesFixtureReport,
  storiesFixtureCatalog,
  triageStoryId,
} from './reports';

function Controlled({
  report = storiesFixtureReport,
  catalog = storiesFixtureCatalog,
  runState = null,
  initialSelection = null,
  project,
}: {
  readonly report?: StoriesRun;
  readonly catalog?: StoryCatalog;
  readonly runState?: LaymosStoriesRunState;
  readonly initialSelection?: LaymosStoriesSelection;
  readonly project?: StoryCollection['project'];
}) {
  const [selection, setSelection] = useFixtureInput<LaymosStoriesSelection>(
    'selection',
    initialSelection,
  );
  const fixtureRuns: StoriesRun = storiesFixtureReport;
  const collection: StoryCollection = {
    catalog,
    traces: Object.fromEntries(
      catalog.modules.flatMap(({ stories }) =>
        stories.flatMap(({ storyPath }) => {
          const story = fixtureRuns.stories[storyPath];
          return story
            ? [
                [
                  storyPath,
                  {
                    status: 'valid' as const,
                    generatedAt: story.generatedAt,
                    blocks: story.blocks,
                    execution: Object.keys(story.blocks).map((blockId) => ({
                      kind: 'step' as const,
                      blockId,
                    })),
                    definitions: {},
                  },
                ] as const,
              ]
            : [];
        }),
      ),
    ),
    ...(project ? { project } : {}),
  };
  return (
    <div className="h-[880px] w-full min-w-[1040px] p-4">
      <LaymosStories
        collection={collection}
        runs={report}
        runState={runState}
        selection={selection}
        onSelectionChange={setSelection}
        onRunStory={() => undefined}
        onRunModule={() => undefined}
        onRunAll={() => undefined}
      />
    </div>
  );
}

export default {
  'no story files': (
    <Controlled
      catalog={emptyStoriesFixtureCatalog}
      report={emptyStoriesFixtureReport}
    />
  ),
  'not run': <Controlled report={emptyStoriesFixtureReport} />,
  'partially run': <Controlled report={singleStoryFixtureReport} />,
  'running story': (
    <Controlled
      report={emptyStoriesFixtureReport}
      runState={{ kind: 'story', storyPath: checkoutStoryId }}
      initialSelection={{ kind: 'story', storyPath: checkoutStoryId }}
    />
  ),
  'refreshing story': (
    <Controlled
      report={storiesFixtureReport}
      runState={{ kind: 'story', storyPath: checkoutStoryId }}
      initialSelection={{ kind: 'story', storyPath: checkoutStoryId }}
    />
  ),
  'running all': (
    <Controlled report={storiesFixtureReport} runState={{ kind: 'all' }} />
  ),
  'project narrative': <Controlled project={projectNarrativeFixture} />,
  overview: <Controlled />,
  'unified flow': (
    <Controlled
      report={singleStoryFixtureReport}
      initialSelection={{ kind: 'story', storyPath: checkoutStoryId }}
    />
  ),
  'parallel scenario flow': (
    <Controlled
      report={singleStoryFixtureReport}
      initialSelection={{
        kind: 'scenario',
        storyPath: checkoutStoryId,
        scenarioIndex: 0,
      }}
    />
  ),
  'failed scenario flow': (
    <Controlled
      report={singleStoryFixtureReport}
      initialSelection={{
        kind: 'scenario',
        storyPath: checkoutStoryId,
        scenarioIndex: 2,
      }}
    />
  ),
  'large decision tree story': (
    <Controlled
      initialSelection={{ kind: 'story', storyPath: triageStoryId }}
    />
  ),
  'large decision tree scenario': (
    <Controlled
      initialSelection={{
        kind: 'scenario',
        storyPath: triageStoryId,
        scenarioIndex: 0,
      }}
    />
  ),
};
