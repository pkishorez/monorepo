import {
  ArrowRight,
  BookOpenText,
  LoaderCircle,
  Network,
  Play,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';

import { buildStoryEntries } from '../lib/model';
import type { LaymosStoriesProps } from '../types';
import { StoryNavigator } from './story-navigator';
import { ScenarioCanvas, StoryCanvas } from './story-canvas';
import { ScenarioNarrative, StoryNarrative } from './story-narrative';

type StoryView = 'narrative' | 'graph';

/** Renders controlled Story navigation with progressively disclosed views. */
export function LaymosStories({
  storyIds,
  report,
  runState,
  selection,
  onSelectionChange,
  onRunStory,
  onRunAll,
  className,
  ariaLabel = 'Laymos stories',
}: LaymosStoriesProps) {
  const [view, setView] = useState<StoryView>('narrative');
  const entries = useMemo(
    () => buildStoryEntries(storyIds, report.stories),
    [report, storyIds],
  );

  const selectedEntry = selection
    ? entries.find((entry) => entry.storyId === selection.storyId)
    : undefined;
  const selectedScenario =
    selection?.kind === 'scenario'
      ? selectedEntry?.scenarios.find(
          (entry) => entry.scenarioIndex === selection.scenarioIndex,
        )
      : undefined;
  const selectedStoryRunning =
    runState?.kind === 'all' ||
    (runState?.kind === 'story' && runState.storyId === selectedEntry?.storyId);

  useEffect(() => {
    if (!selection) return;
    if (!entries.some(({ storyId }) => storyId === selection.storyId)) {
      onSelectionChange(null);
      return;
    }
    if (selection.kind === 'scenario' && selectedScenario === undefined) {
      onSelectionChange({ kind: 'story', storyId: selection.storyId });
    }
  }, [entries, onSelectionChange, selectedScenario, selection]);

  return (
    <section
      className={cn(
        'flex h-full w-full overflow-hidden rounded-lg border border-border bg-background',
        className,
      )}
      aria-label={ariaLabel}
    >
      <StoryNavigator
        entries={entries}
        selection={selection}
        onSelectionChange={onSelectionChange}
        onRunAll={onRunAll}
        runState={runState}
      />
      <main className="min-w-0 flex-1">
        {entries.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No Story files found
          </div>
        )}
        {entries.length > 0 && !selection && (
          <div className="flex h-full items-center justify-center p-10">
            <div className="w-full max-w-xl">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Stories
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                {Object.keys(report.stories).length === 0
                  ? 'Stories are ready to run'
                  : 'Choose an execution narrative'}
              </h2>
              <div className="mt-7 divide-y divide-border border-y border-border">
                {entries.map(({ storyId, story, scenarios }) => (
                  <div key={storyId} className="flex items-center gap-2 py-3">
                    <button
                      type="button"
                      className="group flex min-w-0 flex-1 items-center gap-4 py-1 text-left"
                      onClick={() =>
                        onSelectionChange({ kind: 'story', storyId })
                      }
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {story?.name ?? storyId}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          {story
                            ? `${scenarios.length} ${scenarios.length === 1 ? 'scenario' : 'scenarios'}`
                            : 'Not run'}
                        </span>
                      </span>
                      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
                    </button>
                    {onRunStory && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={runState !== null}
                        onClick={() => onRunStory(storyId)}
                        aria-label={`${story ? 'Refresh' : 'Run'} ${story?.name ?? storyId}`}
                      >
                        {runState?.kind === 'story' &&
                        runState.storyId === storyId ? (
                          <LoaderCircle className="animate-spin" aria-hidden />
                        ) : story ? (
                          <RefreshCw aria-hidden />
                        ) : (
                          <Play aria-hidden />
                        )}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {selection?.kind === 'story' &&
          selectedEntry &&
          !selectedEntry.story && (
            <UnexecutedStory
              storyId={selectedEntry.storyId}
              running={selectedStoryRunning}
              onRun={onRunStory}
            />
          )}
        {selection?.kind === 'story' && selectedEntry?.story && (
          <ExecutedStory
            storyId={selectedEntry.storyId}
            generatedAt={selectedEntry.story.generatedAt}
            running={selectedStoryRunning}
            onRun={onRunStory}
            view={view}
            onViewChange={setView}
          >
            {view === 'narrative' ? (
              <StoryNarrative story={selectedEntry.story} />
            ) : (
              <StoryCanvas story={selectedEntry.story} />
            )}
          </ExecutedStory>
        )}
        {selection?.kind === 'scenario' &&
          selectedEntry &&
          selectedScenario &&
          selectedEntry.story && (
            <ExecutedStory
              storyId={selectedEntry.storyId}
              generatedAt={selectedEntry.story.generatedAt}
              running={selectedStoryRunning}
              onRun={onRunStory}
              view={view}
              onViewChange={setView}
            >
              {view === 'narrative' ? (
                <ScenarioNarrative
                  story={selectedEntry.story}
                  scenario={selectedScenario.scenario}
                />
              ) : (
                <ScenarioCanvas
                  story={selectedEntry.story}
                  scenario={selectedScenario.scenario}
                />
              )}
            </ExecutedStory>
          )}
        {selection &&
          (!selectedEntry ||
            (selection.kind === 'scenario' && !selectedScenario)) && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              The selected Story or Scenario is not present in this report.
            </div>
          )}
      </main>
    </section>
  );
}

function UnexecutedStory({
  storyId,
  running,
  onRun,
}: {
  readonly storyId: string;
  readonly running: boolean;
  readonly onRun?: (storyId: string) => void;
}) {
  return (
    <div className="flex h-full items-center justify-center p-10 text-center">
      <div className="max-w-md">
        <p className="font-mono text-xs text-muted-foreground">{storyId}</p>
        <h2 className="mt-3 text-xl font-semibold">
          This Story has not run yet
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Run it to generate fresh execution evidence for its Scenarios.
        </p>
        {onRun && (
          <Button
            type="button"
            className="mt-5"
            disabled={running}
            onClick={() => onRun(storyId)}
          >
            {running ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <Play aria-hidden />
            )}
            {running ? 'Running…' : 'Run Story'}
          </Button>
        )}
      </div>
    </div>
  );
}

function ExecutedStory({
  storyId,
  generatedAt,
  running,
  onRun,
  view,
  onViewChange,
  children,
}: {
  readonly storyId: string;
  readonly generatedAt: number;
  readonly running: boolean;
  readonly onRun?: (storyId: string) => void;
  readonly view: StoryView;
  readonly onViewChange: (view: StoryView) => void;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
        <div
          className="flex items-center rounded-md bg-muted p-0.5"
          role="group"
          aria-label="Story view"
        >
          <button
            type="button"
            className={cn(
              'flex h-7 items-center gap-1.5 rounded px-2.5 text-[10px] font-medium transition-colors',
              view === 'narrative'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => onViewChange('narrative')}
            aria-pressed={view === 'narrative'}
          >
            <BookOpenText className="size-3.5" aria-hidden />
            Narrative
          </button>
          <button
            type="button"
            className={cn(
              'flex h-7 items-center gap-1.5 rounded px-2.5 text-[10px] font-medium transition-colors',
              view === 'graph'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => onViewChange('graph')}
            aria-pressed={view === 'graph'}
          >
            <Network className="size-3.5" aria-hidden />
            Graph
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground">
            Generated {new Date(generatedAt).toLocaleString()}
          </span>
          {onRun && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={running}
              onClick={() => onRun(storyId)}
            >
              {running ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <RefreshCw aria-hidden />
              )}
              {running ? 'Refreshing…' : 'Refresh Story'}
            </Button>
          )}
        </div>
      </div>
      <div className={cn('relative min-h-0 flex-1', running && 'opacity-70')}>
        {children}
        {running && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/20">
            <LoaderCircle
              className="size-6 animate-spin text-primary"
              aria-label="Refreshing Story"
            />
          </div>
        )}
      </div>
    </div>
  );
}
