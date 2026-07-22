import {
  ArrowRight,
  BookOpenText,
  ChevronRight,
  Folder,
  LoaderCircle,
  Network,
  Play,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { StoryTrace } from 'laymos/report';

import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';

import {
  buildStoryCatalogTree,
  storyRunFromTrace,
  storyGroupKey,
  type StoryCatalogTree,
  type StoryEntry,
  type StoryGroupEntry,
} from '../lib/model';
import type { LaymosStoriesProps, LaymosStoryExecutionState } from '../types';
import { StoryNavigator } from './story-navigator';
import { ScenarioCanvas, StoryCanvas } from './story-canvas';
import { ScenarioNarrative, StoryNarrative } from './story-narrative';

type StoryView = 'narrative' | 'graph';

/** Renders controlled Story navigation with progressively disclosed views. */
export function LaymosStories({
  collection,
  runs,
  storyStates = {},
  runState,
  selection,
  onSelectionChange,
  onRunStory,
  onRunGroup,
  onRunAll,
  sidebarExpansion = 'single',
  className,
  ariaLabel = 'Laymos stories',
}: LaymosStoriesProps) {
  const [view, setView] = useState<StoryView>('graph');
  const tree = useMemo(
    () => buildStoryCatalogTree(collection.catalog, runs.stories),
    [collection, runs],
  );
  const entries = tree.stories;
  const displayedStoryStates = useMemo<
    NonNullable<LaymosStoriesProps['storyStates']>
  >(() => {
    const next = { ...storyStates };
    for (const { storyId } of entries) {
      const execution = storyStates[storyId];
      const trace = collection.traces[storyId];
      if (execution?.status === 'loading' || execution?.status === 'error') {
        continue;
      }
      if (trace?.status === 'invalid') {
        next[storyId] = { status: 'error', message: trace.message };
      } else if (execution?.status === 'success' && trace === undefined) {
        next[storyId] = {
          status: 'error',
          message: 'No structural trace was returned for this Story.',
        };
      }
    }
    return next;
  }, [collection.traces, entries, storyStates]);

  const selectedEntry =
    selection?.kind === 'story' || selection?.kind === 'scenario'
      ? entries.find((entry) => entry.storyId === selection.storyId)
      : undefined;
  const selectedGroup =
    selection?.kind === 'group'
      ? findGroup(tree.groups, selection.groupPath)
      : undefined;
  const selectedScenario =
    selection?.kind === 'scenario'
      ? selectedEntry?.scenarios.find(
          (entry) => entry.scenarioIndex === selection.scenarioIndex,
        )
      : undefined;
  const selectedExecution = selectedEntry
    ? displayedStoryStates[selectedEntry.storyId]
    : undefined;
  const selectedTrace = selectedEntry
    ? collection.traces[selectedEntry.storyId]
    : undefined;
  const tracedStory = useMemo(
    () =>
      selectedEntry && selectedTrace?.status === 'valid'
        ? storyRunFromTrace(
            selectedTrace,
            selectedEntry.name,
            selectedEntry.description,
          )
        : undefined,
    [selectedEntry, selectedTrace],
  );
  const selectedStoryRunning = selectedExecution
    ? selectedExecution.status === 'loading'
    : runState?.kind === 'all' ||
      (runState?.kind === 'story' &&
        runState.storyId === selectedEntry?.storyId);

  useEffect(() => {
    if (!selection) return;
    if (selection.kind === 'group') {
      if (selectedGroup === undefined) onSelectionChange(null);
      return;
    }
    if (selectedEntry === undefined) {
      onSelectionChange(null);
      return;
    }
    if (selection.kind === 'scenario' && selectedScenario === undefined) {
      onSelectionChange({ kind: 'story', storyId: selection.storyId });
    }
  }, [
    onSelectionChange,
    selectedEntry,
    selectedGroup,
    selectedScenario,
    selection,
  ]);

  return (
    <section
      className={cn(
        'flex h-full w-full overflow-hidden rounded-lg border border-border bg-background',
        className,
      )}
      aria-label={ariaLabel}
    >
      <StoryNavigator
        tree={tree}
        storyStates={displayedStoryStates}
        selection={selection}
        onSelectionChange={onSelectionChange}
        onRunAll={onRunAll}
        runState={runState}
        expansionMode={sidebarExpansion}
      />
      <main className="min-w-0 flex-1">
        {entries.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No Story files found
          </div>
        )}
        {entries.length > 0 && !selection && (
          <CatalogOverview
            tree={tree}
            storyStates={displayedStoryStates}
            runState={runState}
            onSelectionChange={onSelectionChange}
            onRunStory={onRunStory}
          />
        )}
        {selection?.kind === 'group' && selectedGroup && (
          <GroupOverview
            group={selectedGroup}
            storyStates={displayedStoryStates}
            running={runState !== null}
            onSelectionChange={onSelectionChange}
            onRunStory={onRunStory}
            onRunGroup={onRunGroup}
          />
        )}
        {selection?.kind === 'story' && selectedEntry && tracedStory && (
          <ExecutedStory
            storyId={selectedEntry.storyId}
            generatedAt={tracedStory.generatedAt}
            running={selectedStoryRunning}
            execution={displayedStoryStates[selectedEntry.storyId]}
            onRun={onRunStory}
            view={view}
            onViewChange={setView}
          >
            {view === 'narrative' ? (
              <StoryNarrative story={tracedStory} />
            ) : (
              <TraceCanvas
                key={selectedEntry.storyId}
                trace={selectedTrace as StoryTrace}
                name={selectedEntry.name}
                description={selectedEntry.description}
              />
            )}
          </ExecutedStory>
        )}
        {selection?.kind === 'story' && selectedEntry && !tracedStory && (
          <TraceFailure
            name={selectedEntry.name}
            message={
              selectedTrace?.status === 'invalid'
                ? selectedTrace.message
                : 'No structural trace was returned for this Story.'
            }
          />
        )}
        {selection?.kind === 'scenario' &&
          selectedEntry &&
          selectedScenario &&
          selectedEntry.artifact && (
            <ExecutedStory
              storyId={selectedEntry.storyId}
              generatedAt={selectedEntry.artifact.generatedAt}
              running={selectedStoryRunning}
              execution={displayedStoryStates[selectedEntry.storyId]}
              onRun={onRunStory}
              view={view}
              onViewChange={setView}
            >
              {view === 'narrative' ? (
                <ScenarioNarrative
                  story={selectedEntry.artifact}
                  scenario={selectedScenario.scenario}
                />
              ) : (
                <ScenarioCanvas
                  story={selectedEntry.artifact}
                  scenario={selectedScenario.scenario}
                />
              )}
            </ExecutedStory>
          )}
        {selection &&
          selection.kind !== 'group' &&
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

function TraceFailure({ name, message }: { name: string; message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-10">
      <div className="max-w-lg rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="font-semibold">Could not trace {name}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

function TraceCanvas({
  trace,
  name,
  description,
}: {
  trace: StoryTrace;
  name: string;
  description: string;
}) {
  const [definitionId, setDefinitionId] = useState<string | null>(null);
  const definitions = Object.entries(trace.definitions);
  const selectedDefinition = definitionId
    ? trace.definitions[definitionId]
    : undefined;
  const visibleTrace = selectedDefinition
    ? { ...trace, execution: selectedDefinition }
    : trace;
  const story = storyRunFromTrace(
    visibleTrace,
    definitionId ? (trace.blocks[definitionId]?.name ?? definitionId) : name,
    definitionId
      ? (trace.blocks[definitionId]?.description ?? description)
      : description,
  );
  return (
    <div className="flex h-full min-h-0">
      {definitions.length > 0 && (
        <aside className="w-52 shrink-0 overflow-y-auto border-r border-border p-3">
          <p className="mb-2 text-xs font-semibold">Definitions</p>
          <Button
            variant={definitionId === null ? 'secondary' : 'ghost'}
            size="sm"
            className="mb-1 w-full justify-start"
            onClick={() => setDefinitionId(null)}
          >
            Story
          </Button>
          {definitions.map(([blockId]) => (
            <Button
              key={blockId}
              variant={definitionId === blockId ? 'secondary' : 'ghost'}
              size="sm"
              className="mb-1 w-full justify-start"
              onClick={() => setDefinitionId(blockId)}
            >
              {trace.blocks[blockId]?.name ?? blockId}
            </Button>
          ))}
        </aside>
      )}
      <div className="min-w-0 flex-1">
        <StoryCanvas story={story} />
      </div>
    </div>
  );
}

function CatalogOverview({
  tree,
  storyStates,
  runState,
  onSelectionChange,
  onRunStory,
}: {
  readonly tree: StoryCatalogTree;
  readonly storyStates: NonNullable<LaymosStoriesProps['storyStates']>;
  readonly runState: LaymosStoriesProps['runState'];
  readonly onSelectionChange: LaymosStoriesProps['onSelectionChange'];
  readonly onRunStory?: LaymosStoriesProps['onRunStory'];
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (group: StoryGroupEntry): void => {
    setExpanded((current) => {
      const next = new Set(current);
      const key = storyGroupKey(group.path);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  return (
    <div className="h-full overflow-y-auto p-10">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Stories
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          {tree.stories.every(({ artifact }) => artifact === undefined) &&
          Object.keys(storyStates).length === 0
            ? 'Stories are ready to run'
            : 'Choose an execution narrative'}
        </h2>
        <div className="mt-7 space-y-2">
          {tree.groups.map((group) => (
            <OverviewGroup
              key={storyGroupKey(group.path)}
              group={group}
              depth={0}
              expanded={expanded}
              storyStates={storyStates}
              runState={runState}
              onSelectionChange={onSelectionChange}
              onRunStory={onRunStory}
              onToggle={toggle}
            />
          ))}
          {tree.groups.length > 0 && tree.standaloneStories.length > 0 && (
            <section className="mt-6 rounded-lg border border-dashed border-border p-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Standalone stories
              </h3>
              <div className="mt-2 divide-y divide-border">
                {tree.standaloneStories.map((entry) => (
                  <StorySummaryRow
                    key={entry.storyId}
                    entry={entry}
                    storyStates={storyStates}
                    runState={runState}
                    onSelectionChange={onSelectionChange}
                    onRunStory={onRunStory}
                  />
                ))}
              </div>
            </section>
          )}
          {tree.groups.length === 0 && (
            <div className="divide-y divide-border border-y border-border">
              {tree.standaloneStories.map((entry) => (
                <StorySummaryRow
                  key={entry.storyId}
                  entry={entry}
                  storyStates={storyStates}
                  runState={runState}
                  onSelectionChange={onSelectionChange}
                  onRunStory={onRunStory}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OverviewGroup({
  group,
  depth,
  expanded,
  storyStates,
  runState,
  onSelectionChange,
  onRunStory,
  onToggle,
}: {
  readonly group: StoryGroupEntry;
  readonly depth: number;
  readonly expanded: ReadonlySet<string>;
  readonly storyStates: NonNullable<LaymosStoriesProps['storyStates']>;
  readonly runState: LaymosStoriesProps['runState'];
  readonly onSelectionChange: LaymosStoriesProps['onSelectionChange'];
  readonly onRunStory?: LaymosStoriesProps['onRunStory'];
  readonly onToggle: (group: StoryGroupEntry) => void;
}) {
  const open = expanded.has(storyGroupKey(group.path));
  return (
    <div className={cn(depth > 0 && 'ml-5 border-l border-border pl-3')}>
      <div className="flex items-center rounded-lg border border-border bg-muted/20">
        <button
          type="button"
          className="grid size-10 shrink-0 place-items-center"
          onClick={() => onToggle(group)}
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${group.name}`}
        >
          <ChevronRight
            className={cn('size-4 transition-transform', open && 'rotate-90')}
            aria-hidden
          />
        </button>
        <button
          type="button"
          className="group flex min-w-0 flex-1 items-center gap-3 py-3 pr-4 text-left"
          onClick={() =>
            onSelectionChange({ kind: 'group', groupPath: group.path })
          }
        >
          <Folder className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{group.name}</span>
            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
              {group.description}
            </span>
          </span>
          <span className="text-[10px] text-muted-foreground">
            {group.descendantStoryIds.length}{' '}
            {group.descendantStoryIds.length === 1 ? 'Story' : 'Stories'}
          </span>
          <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
        </button>
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          {group.groups.map((child) => (
            <OverviewGroup
              key={storyGroupKey(child.path)}
              group={child}
              depth={depth + 1}
              expanded={expanded}
              storyStates={storyStates}
              runState={runState}
              onSelectionChange={onSelectionChange}
              onRunStory={onRunStory}
              onToggle={onToggle}
            />
          ))}
          {group.stories.length > 0 && (
            <div className="ml-5 divide-y divide-border border-l border-border pl-3">
              {group.stories.map((entry) => (
                <StorySummaryRow
                  key={entry.storyId}
                  entry={entry}
                  storyStates={storyStates}
                  runState={runState}
                  onSelectionChange={onSelectionChange}
                  onRunStory={onRunStory}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GroupOverview({
  group,
  storyStates,
  running,
  onSelectionChange,
  onRunStory,
  onRunGroup,
}: {
  readonly group: StoryGroupEntry;
  readonly storyStates: NonNullable<LaymosStoriesProps['storyStates']>;
  readonly running: boolean;
  readonly onSelectionChange: LaymosStoriesProps['onSelectionChange'];
  readonly onRunStory?: LaymosStoriesProps['onRunStory'];
  readonly onRunGroup?: LaymosStoriesProps['onRunGroup'];
}) {
  const passed = group.descendantStoryIds.filter(
    (storyId) => storyStates[storyId]?.status === 'success',
  ).length;
  return (
    <div className="h-full overflow-y-auto p-10">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs text-muted-foreground">
          {group.path.join(' / ')}
        </p>
        <div className="mt-2 flex items-start justify-between gap-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {group.name}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {group.description}
            </p>
          </div>
          {onRunGroup && (
            <Button
              type="button"
              disabled={running}
              onClick={() => onRunGroup(group.path)}
            >
              {running ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <Play aria-hidden />
              )}
              {running ? 'Running…' : 'Run group'}
            </Button>
          )}
        </div>
        <p className="mt-5 text-xs text-muted-foreground">
          {group.descendantStoryIds.length} Stories · {passed} passed
        </p>
        {group.groups.length > 0 && (
          <section className="mt-8">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Groups
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {group.groups.map((child) => (
                <button
                  key={storyGroupKey(child.path)}
                  type="button"
                  className="rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/50"
                  onClick={() =>
                    onSelectionChange({ kind: 'group', groupPath: child.path })
                  }
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Folder className="size-4 text-primary" aria-hidden />
                    {child.name}
                  </span>
                  <span className="mt-2 block text-xs text-muted-foreground">
                    {child.description}
                  </span>
                  <span className="mt-3 block text-[10px] text-muted-foreground">
                    {child.descendantStoryIds.length} Stories
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        {group.stories.length > 0 && (
          <section className="mt-8">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Stories
            </h3>
            <div className="mt-3 divide-y divide-border border-y border-border">
              {group.stories.map((entry) => (
                <StorySummaryRow
                  key={entry.storyId}
                  entry={entry}
                  storyStates={storyStates}
                  runState={
                    running ? { kind: 'group', groupPath: group.path } : null
                  }
                  onSelectionChange={onSelectionChange}
                  onRunStory={onRunStory}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function StorySummaryRow({
  entry,
  storyStates,
  runState,
  onSelectionChange,
  onRunStory,
}: {
  readonly entry: StoryEntry;
  readonly storyStates: NonNullable<LaymosStoriesProps['storyStates']>;
  readonly runState: LaymosStoriesProps['runState'];
  readonly onSelectionChange: LaymosStoriesProps['onSelectionChange'];
  readonly onRunStory?: LaymosStoriesProps['onRunStory'];
}) {
  const execution = storyStates[entry.storyId];
  return (
    <div className="flex items-center gap-2 py-3">
      <button
        type="button"
        className="group flex min-w-0 flex-1 items-center gap-4 py-1 text-left"
        onClick={() =>
          onSelectionChange({ kind: 'story', storyId: entry.storyId })
        }
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {entry.name}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
            {execution?.status === 'loading'
              ? 'Running…'
              : execution?.status === 'success'
                ? 'Passed'
                : execution?.status === 'error'
                  ? 'Failed'
                  : entry.artifact
                    ? `${entry.scenarios.length} ${entry.scenarios.length === 1 ? 'scenario' : 'scenarios'}`
                    : 'Not run'}
          </span>
        </span>
        <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
      </button>
      {onRunStory && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={runState !== null}
          onClick={() => onRunStory(entry.storyId)}
          aria-label={`${entry.artifact ? 'Refresh' : 'Run'} ${entry.name}`}
        >
          {execution?.status === 'loading' ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : entry.artifact ? (
            <RefreshCw aria-hidden />
          ) : (
            <Play aria-hidden />
          )}
        </Button>
      )}
    </div>
  );
}

function findGroup(
  groups: readonly StoryGroupEntry[],
  path: readonly string[],
): StoryGroupEntry | undefined {
  for (const group of groups) {
    if (storyGroupKey(group.path) === storyGroupKey(path)) return group;
    const nested = findGroup(group.groups, path);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function ExecutedStory({
  storyId,
  generatedAt,
  running,
  execution,
  onRun,
  view,
  onViewChange,
  children,
}: {
  readonly storyId: string;
  readonly generatedAt: number;
  readonly running: boolean;
  readonly execution?: LaymosStoryExecutionState;
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
      {execution?.status === 'error' && (
        <div className="flex shrink-0 items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
          <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="whitespace-pre-line">{execution.message}</span>
        </div>
      )}
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
