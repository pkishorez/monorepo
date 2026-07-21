import {
  Ban,
  BookOpen,
  CheckCircle2,
  CircleDashed,
  LoaderCircle,
  Play,
  XCircle,
} from 'lucide-react';

import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';

import type { StoryEntry } from '../lib/model';
import type { LaymosStoriesRunState, LaymosStoriesSelection } from '../types';

const scenarioIcon = {
  succeeded: CheckCircle2,
  failed: XCircle,
  interrupted: Ban,
  skipped: CircleDashed,
} as const;

export function StoryNavigator({
  entries,
  selection,
  onSelectionChange,
  onRunAll,
  runState,
}: {
  readonly entries: readonly StoryEntry[];
  readonly selection: LaymosStoriesSelection;
  readonly onSelectionChange: (selection: LaymosStoriesSelection) => void;
  readonly onRunAll?: () => void;
  readonly runState: LaymosStoriesRunState;
}) {
  const running = runState !== null;
  const loadedCount = entries.filter(({ story }) => story !== undefined).length;
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-muted/20">
      <button
        type="button"
        className={cn(
          'w-full border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted',
          selection === null && 'bg-muted/80',
        )}
        onClick={() => onSelectionChange(null)}
        aria-current={selection === null ? 'page' : undefined}
      >
        <span className="flex items-center gap-2">
          <BookOpen className="size-4 text-primary" aria-hidden />
          <span className="text-sm font-semibold">All stories</span>
        </span>
        <span className="mt-0.5 block text-[10px] text-muted-foreground">
          {loadedCount}/{entries.length} executed
        </span>
      </button>
      <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Stories">
        {entries.map(({ storyId, story, scenarios }) => {
          const storySelected =
            selection?.kind === 'story' && selection.storyId === storyId;
          return (
            <div key={storyId} className="mb-2">
              <button
                type="button"
                className={cn(
                  'w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted',
                  storySelected && 'bg-primary/10 text-primary',
                )}
                onClick={() => onSelectionChange({ kind: 'story', storyId })}
              >
                <span className="block truncate text-xs font-semibold">
                  {story?.name ?? 'Not run'}
                </span>
                <span className="block truncate font-mono text-[9px] text-muted-foreground">
                  {storyId}
                </span>
              </button>
              {story && (
                <div className="ml-3 border-l border-border pl-2">
                  {scenarios.map(({ scenarioIndex, scenario }) => {
                    const selected =
                      selection?.kind === 'scenario' &&
                      selection.storyId === storyId &&
                      selection.scenarioIndex === scenarioIndex;
                    const Icon = scenarioIcon[scenario.outcome];
                    return (
                      <button
                        key={scenarioIndex}
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                          selected && 'bg-primary/10 font-medium text-primary',
                        )}
                        onClick={() =>
                          onSelectionChange({
                            kind: 'scenario',
                            storyId,
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
        })}
      </nav>
      {onRunAll && entries.length > 0 && (
        <div className="shrink-0 border-t border-border p-2">
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={running}
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
