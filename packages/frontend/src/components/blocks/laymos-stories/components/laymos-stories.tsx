import {
  ArrowRight,
  BookOpenText,
  Folder,
  LoaderCircle,
  Network,
  Play,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { StoryCollection, StoryRun, StoryTrace } from 'laymos/report';

import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';

import {
  buildStoryCatalogTree,
  inlineTraceDefinitions,
  storyRunFromTrace,
  type StoryCatalogTree,
  type StoryEntry,
  type StoryModuleEntry,
} from '../lib/model';
import type {
  LaymosStoriesProps,
  LaymosStoryCanvasPreferences,
  LaymosStoryExecutionState,
} from '../types';
import { StoryNavigator } from './story-navigator';
import { ScenarioCanvas, StoryCanvas } from './story-canvas';
import { ScenarioNarrative, StoryNarrative } from './story-narrative';
import { ProjectNarrative } from './project-narrative';

type StoryView = 'narrative' | 'graph';

/** Renders controlled Story navigation with progressively disclosed views. */
export function LaymosStories({
  collection,
  runs,
  storyStates = {},
  runState,
  selection,
  onSelectionChange,
  selectedNodeId,
  onSelectedNodeIdChange,
  onHoveredNodeIdChange,
  onNodeClick,
  onGraphNodesChange,
  openCodeOnSelect = false,
  onOpenCodeOnSelectChange,
  centerNodeRequest,
  renderNodeActions,
  onRunStory,
  onRunModule,
  onRunAll,
  defaultStoryView = 'narrative',
  graphOnly = false,
  canvasPreferences,
  onCanvasPreferencesChange,
  showNavigator = true,
  className,
  ariaLabel = 'Laymos stories',
}: LaymosStoriesProps) {
  const [view, setView] = useState<StoryView>(defaultStoryView);
  const [localCanvasPreferences, setLocalCanvasPreferences] =
    useState<LaymosStoryCanvasPreferences>({
      showDetails: true,
      showDescriptionPopover: true,
      centerSelected: false,
      showExecutionCoverage: false,
    });
  const effectiveCanvasPreferences =
    canvasPreferences ?? localCanvasPreferences;
  const setCanvasPreferences = (preferences: LaymosStoryCanvasPreferences) => {
    setLocalCanvasPreferences(preferences);
    onCanvasPreferencesChange?.(preferences);
  };
  const tree = useMemo(
    () => buildStoryCatalogTree(collection.catalog, runs.stories),
    [collection, runs],
  );
  const entries = tree.stories;
  const displayedStoryStates = useMemo<
    NonNullable<LaymosStoriesProps['storyStates']>
  >(() => {
    const next = { ...storyStates };
    for (const { storyPath } of entries) {
      const execution = storyStates[storyPath];
      const trace = collection.traces[storyPath];
      if (execution?.status === 'loading' || execution?.status === 'error') {
        continue;
      }
      if (trace?.status === 'invalid') {
        next[storyPath] = { status: 'error', message: trace.message };
      } else if (execution?.status === 'success' && trace === undefined) {
        next[storyPath] = {
          status: 'error',
          message: 'No structural trace was returned for this Story.',
        };
      }
    }
    return next;
  }, [collection.traces, entries, storyStates]);

  const selectedEntry =
    selection?.kind === 'story' || selection?.kind === 'scenario'
      ? entries.find((entry) => entry.storyPath === selection.storyPath)
      : undefined;
  const selectedModule =
    selection?.kind === 'module'
      ? tree.modules.find(
          ({ modulePath }) => modulePath === selection.modulePath,
        )
      : undefined;
  const selectedScenario =
    selection?.kind === 'scenario'
      ? selectedEntry?.scenarios.find(
          (entry) => entry.scenarioIndex === selection.scenarioIndex,
        )
      : undefined;
  const selectedExecution = selectedEntry
    ? displayedStoryStates[selectedEntry.storyPath]
    : undefined;
  const selectedTrace = selectedEntry
    ? collection.traces[selectedEntry.storyPath]
    : undefined;
  const tracedStory = useMemo(
    () =>
      selectedEntry && selectedTrace?.status === 'valid'
        ? storyRunFromTrace(
            selectedTrace,
            selectedEntry.name,
            selectedEntry.description,
            selectedEntry.documentation,
          )
        : undefined,
    [selectedEntry, selectedTrace],
  );
  const selectedStoryRunning =
    selectedExecution?.status === 'loading' ||
    runState?.kind === 'all' ||
    (runState?.kind === 'story' &&
      runState.storyPath === selectedEntry?.storyPath) ||
    (runState?.kind === 'module' &&
      runState.modulePath === selectedEntry?.modulePath);

  useEffect(() => {
    if (!selection) return;
    if (selection.kind === 'project-narrative' || selection.kind === 'catalog')
      return;
    if (selection.kind === 'module') {
      if (selectedModule === undefined) onSelectionChange(null);
      return;
    }
    if (selectedEntry === undefined) {
      onSelectionChange(null);
      return;
    }
    if (selection.kind === 'scenario' && selectedScenario === undefined) {
      onSelectionChange({ kind: 'story', storyPath: selection.storyPath });
    }
  }, [
    onSelectionChange,
    selectedEntry,
    selectedModule,
    selectedScenario,
    selection,
  ]);

  useEffect(() => {
    if (selection?.kind === 'story' || selection?.kind === 'scenario') {
      setView(defaultStoryView);
    }
  }, [
    defaultStoryView,
    selection?.kind,
    selection?.kind === 'story' || selection?.kind === 'scenario'
      ? selection.storyPath
      : undefined,
    selection?.kind === 'scenario' ? selection.scenarioIndex : undefined,
  ]);

  return (
    <section
      className={cn(
        'flex h-full w-full overflow-hidden rounded-lg border border-border bg-background',
        className,
      )}
      aria-label={ariaLabel}
    >
      {showNavigator && (
        <StoryNavigator
          tree={tree}
          storyStates={displayedStoryStates}
          selection={selection}
          onSelectionChange={onSelectionChange}
          onRunAll={onRunAll}
          runState={runState}
          hasProjectNarrative={collection.project !== undefined}
        />
      )}
      <main className="min-w-0 flex-1">
        {entries.length === 0 &&
          (collection.project === undefined ||
            selection?.kind === 'catalog') && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No Story files found
            </div>
          )}
        {collection.project !== undefined &&
          (selection?.kind === 'project-narrative' || !selection) && (
            <ProjectNarrative project={collection.project} />
          )}
        {entries.length > 0 &&
          (selection?.kind === 'catalog' ||
            (!selection && collection.project === undefined)) && (
            <CatalogOverview
              tree={tree}
              catalog={collection.catalog}
              storyStates={displayedStoryStates}
              runState={runState}
              onSelectionChange={onSelectionChange}
              onRunStory={onRunStory}
            />
          )}
        {selection?.kind === 'module' && selectedModule && (
          <ModuleOverview
            module={selectedModule}
            storyStates={displayedStoryStates}
            running={runState !== null}
            onSelectionChange={onSelectionChange}
            onRunStory={onRunStory}
            onRunModule={onRunModule}
          />
        )}
        {selection?.kind === 'story' && selectedEntry && tracedStory && (
          <ExecutedStory
            storyPath={selectedEntry.storyPath}
            generatedAt={tracedStory.generatedAt}
            running={selectedStoryRunning}
            execution={displayedStoryStates[selectedEntry.storyPath]}
            onRun={onRunStory}
            view={view}
            onViewChange={setView}
            minimal={graphOnly}
          >
            {view === 'narrative' ? (
              <StoryNarrative story={tracedStory} />
            ) : (
              <TraceCanvas
                key={selectedEntry.storyPath}
                trace={selectedTrace as StoryTrace}
                name={selectedEntry.name}
                description={selectedEntry.description}
                run={selectedEntry.artifact}
                preferences={effectiveCanvasPreferences}
                onPreferencesChange={setCanvasPreferences}
                selectedNodeId={selectedNodeId}
                onSelectedNodeIdChange={onSelectedNodeIdChange}
                onHoveredNodeIdChange={onHoveredNodeIdChange}
                onNodeClick={onNodeClick}
                onGraphNodesChange={onGraphNodesChange}
                openCodeOnSelect={openCodeOnSelect}
                onOpenCodeOnSelectChange={onOpenCodeOnSelectChange}
                centerNodeRequest={centerNodeRequest}
                renderNodeActions={renderNodeActions}
                showDefinitions={!graphOnly}
                inlineDefinitions={graphOnly}
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
              storyPath={selectedEntry.storyPath}
              generatedAt={selectedEntry.artifact.generatedAt}
              running={selectedStoryRunning}
              execution={displayedStoryStates[selectedEntry.storyPath]}
              onRun={onRunStory}
              view={view}
              onViewChange={setView}
              minimal={graphOnly}
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
                  preferences={effectiveCanvasPreferences}
                  onPreferencesChange={setCanvasPreferences}
                  selectedNodeId={selectedNodeId}
                  onSelectedNodeIdChange={onSelectedNodeIdChange}
                  onHoveredNodeIdChange={onHoveredNodeIdChange}
                  onNodeClick={onNodeClick}
                  onGraphNodesChange={onGraphNodesChange}
                  openCodeOnSelect={openCodeOnSelect}
                  onOpenCodeOnSelectChange={onOpenCodeOnSelectChange}
                  centerNodeRequest={centerNodeRequest}
                  renderNodeActions={renderNodeActions}
                />
              )}
            </ExecutedStory>
          )}
        {(selection?.kind === 'story' || selection?.kind === 'scenario') &&
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
  run,
  preferences,
  onPreferencesChange,
  selectedNodeId,
  onSelectedNodeIdChange,
  onHoveredNodeIdChange,
  onNodeClick,
  onGraphNodesChange,
  openCodeOnSelect,
  onOpenCodeOnSelectChange,
  centerNodeRequest,
  renderNodeActions,
  showDefinitions,
  inlineDefinitions,
}: {
  trace: StoryTrace;
  name: string;
  description: string;
  run?: StoryRun;
  preferences: LaymosStoryCanvasPreferences;
  onPreferencesChange: (preferences: LaymosStoryCanvasPreferences) => void;
  selectedNodeId?: LaymosStoriesProps['selectedNodeId'];
  onSelectedNodeIdChange?: LaymosStoriesProps['onSelectedNodeIdChange'];
  onHoveredNodeIdChange?: LaymosStoriesProps['onHoveredNodeIdChange'];
  onNodeClick?: LaymosStoriesProps['onNodeClick'];
  onGraphNodesChange?: LaymosStoriesProps['onGraphNodesChange'];
  openCodeOnSelect: boolean;
  onOpenCodeOnSelectChange?: LaymosStoriesProps['onOpenCodeOnSelectChange'];
  centerNodeRequest?: LaymosStoriesProps['centerNodeRequest'];
  renderNodeActions?: LaymosStoriesProps['renderNodeActions'];
  showDefinitions: boolean;
  inlineDefinitions: boolean;
}) {
  const [definitionId, setDefinitionId] = useState<string | null>(null);
  const definitions = Object.entries(trace.definitions);
  const selectedDefinition = definitionId
    ? trace.definitions[definitionId]
    : undefined;
  const graphTrace = useMemo(
    () => (inlineDefinitions ? inlineTraceDefinitions(trace) : trace),
    [inlineDefinitions, trace],
  );
  const story = useMemo(
    () =>
      storyRunFromTrace(
        selectedDefinition
          ? { ...trace, execution: selectedDefinition }
          : graphTrace,
        definitionId
          ? (trace.blocks[definitionId]?.name ?? definitionId)
          : name,
        definitionId
          ? (trace.blocks[definitionId]?.description ?? description)
          : description,
      ),
    [definitionId, description, graphTrace, name, selectedDefinition, trace],
  );
  return (
    <div className="flex h-full min-h-0">
      {showDefinitions && definitions.length > 0 && (
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
        <StoryCanvas
          story={story}
          run={definitionId === null ? run : undefined}
          preferences={preferences}
          onPreferencesChange={onPreferencesChange}
          selectedNodeId={selectedNodeId}
          onSelectedNodeIdChange={onSelectedNodeIdChange}
          onHoveredNodeIdChange={onHoveredNodeIdChange}
          onNodeClick={onNodeClick}
          onGraphNodesChange={onGraphNodesChange}
          openCodeOnSelect={openCodeOnSelect}
          onOpenCodeOnSelectChange={onOpenCodeOnSelectChange}
          centerNodeRequest={centerNodeRequest}
          renderNodeActions={renderNodeActions}
        />
      </div>
    </div>
  );
}

function CatalogOverview({
  tree,
  catalog,
  storyStates,
  runState,
  onSelectionChange,
  onRunStory,
}: {
  readonly tree: StoryCatalogTree;
  readonly catalog: StoryCollection['catalog'];
  readonly storyStates: NonNullable<LaymosStoriesProps['storyStates']>;
  readonly runState: LaymosStoriesProps['runState'];
  readonly onSelectionChange: LaymosStoriesProps['onSelectionChange'];
  readonly onRunStory?: LaymosStoriesProps['onRunStory'];
}) {
  const catalogStories = catalog.modules.flatMap(({ stories }) => stories);
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
        <p className="mt-3 text-xs text-muted-foreground">
          Documentation:{' '}
          {
            catalogStories.filter(
              ({ documentation }) => documentation !== undefined,
            ).length
          }
          /{catalogStories.length} stories ·{' '}
          {catalogStories.reduce(
            (count, story) =>
              count +
              (story.scenarios ?? []).filter(
                ({ documentation }) => documentation !== undefined,
              ).length,
            0,
          )}
          /
          {catalogStories.reduce(
            (count, story) => count + (story.scenarios?.length ?? 0),
            0,
          )}{' '}
          scenarios
        </p>
        <div className="mt-7 space-y-2">
          {tree.modules.map((module) => (
            <section
              key={module.modulePath}
              className="rounded-lg border border-border bg-muted/20 p-4"
            >
              <button
                type="button"
                className="group flex w-full items-center gap-3 text-left"
                onClick={() =>
                  onSelectionChange({
                    kind: 'module',
                    modulePath: module.modulePath,
                  })
                }
              >
                <Folder className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {module.modulePath}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                    {module.description}
                  </span>
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {module.stories.length}{' '}
                  {module.stories.length === 1 ? 'Story' : 'Stories'}
                </span>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </button>
              <div className="mt-3 divide-y divide-border border-t border-border">
                {module.stories.map((entry) => (
                  <StorySummaryRow
                    key={entry.storyPath}
                    entry={entry}
                    storyStates={storyStates}
                    runState={runState}
                    onSelectionChange={onSelectionChange}
                    onRunStory={onRunStory}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function ModuleOverview({
  module,
  storyStates,
  running,
  onSelectionChange,
  onRunStory,
  onRunModule,
}: {
  readonly module: StoryModuleEntry;
  readonly storyStates: NonNullable<LaymosStoriesProps['storyStates']>;
  readonly running: boolean;
  readonly onSelectionChange: LaymosStoriesProps['onSelectionChange'];
  readonly onRunStory?: LaymosStoriesProps['onRunStory'];
  readonly onRunModule?: LaymosStoriesProps['onRunModule'];
}) {
  const passed = module.stories.filter(
    ({ storyPath }) => storyStates[storyPath]?.status === 'success',
  ).length;
  return (
    <div className="h-full overflow-y-auto p-10">
      <div className="mx-auto max-w-3xl">
        <div className="mt-2 flex items-start justify-between gap-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {module.modulePath}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {module.description}
            </p>
          </div>
          {onRunModule && (
            <Button
              type="button"
              disabled={running}
              onClick={() => onRunModule(module.modulePath)}
            >
              {running ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <Play aria-hidden />
              )}
              {running ? 'Running…' : 'Run Module'}
            </Button>
          )}
        </div>
        <p className="mt-5 text-xs text-muted-foreground">
          {module.stories.length} Stories · {passed} passed
        </p>
        {module.stories.length > 0 && (
          <section className="mt-8">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Stories
            </h3>
            <div className="mt-3 divide-y divide-border border-y border-border">
              {module.stories.map((entry) => (
                <StorySummaryRow
                  key={entry.storyPath}
                  entry={entry}
                  storyStates={storyStates}
                  runState={
                    running
                      ? { kind: 'module', modulePath: module.modulePath }
                      : null
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
  const execution = storyStates[entry.storyPath];
  return (
    <div className="flex items-center gap-2 py-3">
      <button
        type="button"
        className="group flex min-w-0 flex-1 items-center gap-4 py-1 text-left"
        onClick={() =>
          onSelectionChange({ kind: 'story', storyPath: entry.storyPath })
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
          onClick={() => onRunStory(entry.storyPath)}
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

function ExecutedStory({
  storyPath,
  generatedAt,
  running,
  execution,
  onRun,
  view,
  onViewChange,
  minimal,
  children,
}: {
  readonly storyPath: string;
  readonly generatedAt: number;
  readonly running: boolean;
  readonly execution?: LaymosStoryExecutionState;
  readonly onRun?: (storyPath: string) => void;
  readonly view: StoryView;
  readonly onViewChange: (view: StoryView) => void;
  readonly minimal: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {!minimal && (
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
              Documentation
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
                onClick={() => onRun(storyPath)}
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
      )}
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
