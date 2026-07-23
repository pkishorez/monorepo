import {
  Ban,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Folder,
  LoaderCircle,
  Network,
  Play,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';

import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';

import type { StoryCatalogTree, StoryEntry } from '../lib/model';
import type {
  LaymosStoriesProps,
  LaymosStoriesRunState,
  LaymosStoriesSelection,
} from '../types';

const scenarioIcon = {
  succeeded: CheckCircle2,
  failed: XCircle,
  interrupted: Ban,
  skipped: CircleDashed,
} as const;

export function StoryNavigator({
  tree,
  storyStates,
  selection,
  onSelectionChange,
  onRunAll,
  runState,
  hasProjectNarrative,
}: {
  readonly tree: StoryCatalogTree;
  readonly storyStates: NonNullable<LaymosStoriesProps['storyStates']>;
  readonly selection: LaymosStoriesSelection;
  readonly onSelectionChange: (selection: LaymosStoriesSelection) => void;
  readonly onRunAll?: () => void;
  readonly runState: LaymosStoriesRunState;
  readonly hasProjectNarrative: boolean;
}) {
  const [collapsedStoryPath, setCollapsedStoryPath] = useState<string | null>(
    null,
  );
  const loadedCount = tree.stories.filter(({ storyPath, artifact }) => {
    const execution = storyStates[storyPath];
    return (
      artifact !== undefined ||
      execution?.status === 'success' ||
      execution?.status === 'error'
    );
  }).length;

  const selectStory = (entry: StoryEntry): void => {
    const selected =
      selection?.kind === 'story' && selection.storyPath === entry.storyPath;
    if (selected) {
      setCollapsedStoryPath((current) =>
        current === entry.storyPath ? null : entry.storyPath,
      );
      return;
    }
    setCollapsedStoryPath(null);
    onSelectionChange({ kind: 'story', storyPath: entry.storyPath });
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-muted/20">
      {hasProjectNarrative && (
        <button
          type="button"
          className={cn(
            'w-full border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted',
            (selection === null || selection?.kind === 'project-narrative') &&
              'bg-muted/80',
          )}
          onClick={() => onSelectionChange({ kind: 'project-narrative' })}
          aria-current={
            selection === null || selection?.kind === 'project-narrative'
              ? 'page'
              : undefined
          }
        >
          <span className="flex items-center gap-2">
            <Network className="size-4 text-primary" aria-hidden />
            <span className="text-sm font-semibold">Project Narrative</span>
          </span>
          <span className="mt-0.5 block text-[10px] text-muted-foreground">
            Architecture and responsibilities
          </span>
        </button>
      )}
      <button
        type="button"
        className={cn(
          'w-full border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted',
          (selection?.kind === 'catalog' ||
            (!hasProjectNarrative && selection === null)) &&
            'bg-muted/80',
        )}
        onClick={() => onSelectionChange({ kind: 'catalog' })}
        aria-current={
          selection?.kind === 'catalog' ||
          (!hasProjectNarrative && selection === null)
            ? 'page'
            : undefined
        }
      >
        <span className="flex items-center gap-2">
          <BookOpen className="size-4 text-primary" aria-hidden />
          <span className="text-sm font-semibold">All stories</span>
        </span>
        <span className="mt-0.5 block text-[10px] text-muted-foreground">
          {loadedCount}/{tree.stories.length} executed
        </span>
      </button>
      <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Stories">
        {tree.modules.map((module) => {
          const selected =
            selection?.kind === 'module' &&
            selection.modulePath === module.modulePath;
          return (
            <div key={module.modulePath}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted',
                  selected && 'bg-primary/10 text-primary',
                )}
                onClick={() =>
                  onSelectionChange({
                    kind: 'module',
                    modulePath: module.modulePath,
                  })
                }
              >
                <Folder
                  className="size-3.5 shrink-0 text-primary"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                  {module.modulePath}
                </span>
                <span className="text-[9px] text-muted-foreground">
                  {module.stories.length}
                </span>
              </button>
              <div className="ml-3 border-l border-border pl-1">
                {module.stories.map((story) => (
                  <StoryRow
                    key={story.storyPath}
                    entry={story}
                    storyStates={storyStates}
                    selection={selection}
                    collapsedStoryPath={collapsedStoryPath}
                    onSelect={selectStory}
                    onSelectionChange={onSelectionChange}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      {onRunAll && tree.stories.length > 0 && (
        <div className="shrink-0 border-t border-border p-2">
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={runState !== null}
            onClick={onRunAll}
          >
            {runState?.kind === 'all' ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <Play aria-hidden />
            )}
            {runState?.kind === 'all' ? 'Running…' : 'Run all stories'}
          </Button>
        </div>
      )}
    </aside>
  );
}

function StoryRow({
  entry,
  storyStates,
  selection,
  collapsedStoryPath,
  onSelect,
  onSelectionChange,
}: {
  readonly entry: StoryEntry;
  readonly storyStates: NonNullable<LaymosStoriesProps['storyStates']>;
  readonly selection: LaymosStoriesSelection;
  readonly collapsedStoryPath: string | null;
  readonly onSelect: (entry: StoryEntry) => void;
  readonly onSelectionChange: (selection: LaymosStoriesSelection) => void;
}) {
  const execution = storyStates[entry.storyPath];
  const selected =
    selection?.kind === 'story' && selection.storyPath === entry.storyPath;
  const open =
    collapsedStoryPath !== entry.storyPath &&
    (selection?.kind === 'story' || selection?.kind === 'scenario') &&
    selection.storyPath === entry.storyPath;
  return (
    <div className="pl-2">
      <button
        type="button"
        className={cn(
          'w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted',
          selected && 'bg-primary/10 text-primary',
        )}
        onClick={() => onSelect(entry)}
        aria-expanded={entry.scenarios.length > 0 ? open : undefined}
      >
        <span className="flex items-center gap-1.5">
          {entry.scenarios.length > 0 && (
            <ChevronRight
              className={cn(
                'size-3 shrink-0 transition-transform',
                open && 'rotate-90',
              )}
              aria-hidden
            />
          )}
          {execution?.status === 'loading' ? (
            <LoaderCircle
              className="size-3 animate-spin text-primary"
              aria-hidden
            />
          ) : execution?.status === 'success' ? (
            <CheckCircle2
              className="size-3 text-emerald-600 dark:text-emerald-400"
              aria-hidden
            />
          ) : execution?.status === 'error' ? (
            <XCircle className="size-3 text-destructive" aria-hidden />
          ) : null}
          <span className="block min-w-0 flex-1 truncate text-xs font-semibold">
            {entry.name}
          </span>
          <span
            className="text-[9px] text-muted-foreground"
            aria-label={`${entry.scenarios.length} scenarios`}
          >
            {entry.scenarios.length}
          </span>
        </span>
        <span className="block truncate font-mono text-[9px] text-muted-foreground">
          {entry.storyKey}
        </span>
      </button>
      {entry.artifact && open && (
        <div className="ml-3 border-l border-border pl-2">
          {entry.scenarios.map(({ scenarioIndex, scenario }) => {
            const scenarioSelected =
              selection?.kind === 'scenario' &&
              selection.storyPath === entry.storyPath &&
              selection.scenarioIndex === scenarioIndex;
            const Icon = scenarioIcon[scenario.outcome];
            return (
              <button
                key={scenarioIndex}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  scenarioSelected && 'bg-primary/10 font-medium text-primary',
                )}
                onClick={() =>
                  onSelectionChange({
                    kind: 'scenario',
                    storyPath: entry.storyPath,
                    scenarioIndex,
                  })
                }
              >
                <Icon
                  className={cn(
                    'size-3 shrink-0',
                    scenario.outcome === 'failed' && 'text-destructive',
                    scenario.outcome === 'succeeded' &&
                      'text-emerald-600 dark:text-emerald-400',
                    scenario.outcome === 'interrupted' &&
                      'text-amber-600 dark:text-amber-400',
                  )}
                  aria-hidden
                />
                <span className="truncate">{scenario.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
