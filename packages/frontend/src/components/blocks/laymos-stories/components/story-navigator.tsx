import {
  Ban,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Folder,
  LoaderCircle,
  Play,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';

import type {
  StoryCatalogTree,
  StoryEntry,
  StoryGroupEntry,
} from '../lib/model';
import { storyGroupKey } from '../lib/model';
import {
  initialSidebarExpandedGroups,
  sidebarExpandedGroups,
  sidebarGroupAncestry,
} from '../lib/sidebar-expansion';
import type {
  LaymosStoriesProps,
  LaymosStoriesRunState,
  LaymosStoriesSelection,
  LaymosStoriesSidebarExpansion,
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
  expansionMode,
}: {
  readonly tree: StoryCatalogTree;
  readonly storyStates: NonNullable<LaymosStoriesProps['storyStates']>;
  readonly selection: LaymosStoriesSelection;
  readonly onSelectionChange: (selection: LaymosStoriesSelection) => void;
  readonly onRunAll?: () => void;
  readonly runState: LaymosStoriesRunState;
  readonly expansionMode: LaymosStoriesSidebarExpansion;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() =>
    selection === null ? initialSidebarExpandedGroups(tree.groups) : new Set(),
  );
  const [collapsedStoryId, setCollapsedStoryId] = useState<string | null>(null);
  const selectionSyncKey = JSON.stringify([expansionMode, selection]);
  const lastSelectionSyncKey = useRef(selectionSyncKey);
  const running = runState !== null;
  const loadedCount = tree.stories.filter(({ storyId, artifact }) => {
    const execution = storyStates[storyId];
    return (
      artifact !== undefined ||
      execution?.status === 'success' ||
      execution?.status === 'error'
    );
  }).length;

  useEffect(() => {
    if (lastSelectionSyncKey.current === selectionSyncKey) return;
    lastSelectionSyncKey.current = selectionSyncKey;
    setCollapsedStoryId(null);
    const groupPath =
      selection?.kind === 'group'
        ? selection.groupPath
        : selection?.kind === 'story' || selection?.kind === 'scenario'
          ? tree.stories.find(({ storyId }) => storyId === selection.storyId)
              ?.groupPath
          : undefined;
    if (groupPath === undefined) {
      setExpanded(new Set());
      return;
    }
    const group =
      selection?.kind === 'group'
        ? findGroup(tree.groups, groupPath)
        : undefined;
    setExpanded(
      group
        ? sidebarExpandedGroups(group, expansionMode === 'recursive')
        : sidebarGroupAncestry(groupPath),
    );
  }, [expansionMode, selection, selectionSyncKey, tree.groups, tree.stories]);

  const toggleGroup = (group: StoryGroupEntry): void => {
    setExpanded((current) =>
      current.has(storyGroupKey(group.path))
        ? sidebarGroupAncestry(group.path, false)
        : sidebarExpandedGroups(group, expansionMode === 'recursive'),
    );
  };

  const selectGroup = (group: StoryGroupEntry): void => {
    const selected =
      selection?.kind === 'group' &&
      storyGroupKey(selection.groupPath) === storyGroupKey(group.path);
    if (selected) {
      toggleGroup(group);
      return;
    }
    onSelectionChange({ kind: 'group', groupPath: group.path });
  };

  const selectStory = (entry: StoryEntry): void => {
    const selected =
      selection?.kind === 'story' && selection.storyId === entry.storyId;
    if (selected) {
      setCollapsedStoryId((current) =>
        current === entry.storyId ? null : entry.storyId,
      );
      return;
    }
    onSelectionChange({ kind: 'story', storyId: entry.storyId });
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-muted/20">
      <button
        type="button"
        className={cn(
          'w-full border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted',
          selection === null && 'bg-muted/80',
        )}
        onClick={() => {
          setExpanded(new Set());
          setCollapsedStoryId(null);
          onSelectionChange(null);
        }}
        aria-current={selection === null ? 'page' : undefined}
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
        {tree.groups.map((group) => (
          <GroupRow
            key={storyGroupKey(group.path)}
            group={group}
            depth={0}
            expanded={expanded}
            storyStates={storyStates}
            selection={selection}
            expansionMode={expansionMode}
            collapsedStoryId={collapsedStoryId}
            onSelectGroup={selectGroup}
            onSelectStory={selectStory}
            onSelectionChange={onSelectionChange}
            onToggle={toggleGroup}
          />
        ))}
        {tree.groups.length > 0 && tree.standaloneStories.length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="px-2.5 pb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Standalone stories
            </p>
            {tree.standaloneStories.map((story) => (
              <StoryRow
                key={story.storyId}
                entry={story}
                depth={0}
                storyStates={storyStates}
                selection={selection}
                expansionMode={expansionMode}
                collapsedStoryId={collapsedStoryId}
                onSelect={selectStory}
                onSelectionChange={onSelectionChange}
              />
            ))}
          </div>
        )}
        {tree.groups.length === 0 &&
          tree.standaloneStories.map((story) => (
            <StoryRow
              key={story.storyId}
              entry={story}
              depth={0}
              storyStates={storyStates}
              selection={selection}
              expansionMode={expansionMode}
              collapsedStoryId={collapsedStoryId}
              onSelect={selectStory}
              onSelectionChange={onSelectionChange}
            />
          ))}
      </nav>
      {onRunAll && tree.stories.length > 0 && (
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

function GroupRow({
  group,
  depth,
  expanded,
  storyStates,
  selection,
  expansionMode,
  collapsedStoryId,
  onSelectGroup,
  onSelectStory,
  onSelectionChange,
  onToggle,
}: {
  readonly group: StoryGroupEntry;
  readonly depth: number;
  readonly expanded: ReadonlySet<string>;
  readonly storyStates: NonNullable<LaymosStoriesProps['storyStates']>;
  readonly selection: LaymosStoriesSelection;
  readonly expansionMode: LaymosStoriesSidebarExpansion;
  readonly collapsedStoryId: string | null;
  readonly onSelectGroup: (group: StoryGroupEntry) => void;
  readonly onSelectStory: (entry: StoryEntry) => void;
  readonly onSelectionChange: (selection: LaymosStoriesSelection) => void;
  readonly onToggle: (group: StoryGroupEntry) => void;
}) {
  const open = expanded.has(storyGroupKey(group.path));
  const selected =
    selection?.kind === 'group' &&
    storyGroupKey(selection.groupPath) === storyGroupKey(group.path);
  return (
    <div>
      <div
        className={cn(
          'flex items-center rounded-md transition-colors hover:bg-muted',
          selected && 'bg-primary/10 text-primary',
        )}
        style={{ paddingLeft: `${depth * 12}px` }}
      >
        <button
          type="button"
          className="grid size-7 shrink-0 place-items-center"
          onClick={() => onToggle(group)}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${group.name}`}
          aria-expanded={open}
        >
          <ChevronRight
            className={cn('size-3 transition-transform', open && 'rotate-90')}
            aria-hidden
          />
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pr-2 text-left"
          onClick={() => onSelectGroup(group)}
        >
          <Folder className="size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold">
            {group.name}
          </span>
          <span className="text-[9px] text-muted-foreground">
            {group.descendantStoryIds.length}
          </span>
        </button>
      </div>
      {open && (
        <div>
          {group.groups.map((child) => (
            <GroupRow
              key={storyGroupKey(child.path)}
              group={child}
              depth={depth + 1}
              expanded={expanded}
              storyStates={storyStates}
              selection={selection}
              expansionMode={expansionMode}
              collapsedStoryId={collapsedStoryId}
              onSelectGroup={onSelectGroup}
              onSelectStory={onSelectStory}
              onSelectionChange={onSelectionChange}
              onToggle={onToggle}
            />
          ))}
          {group.stories.map((story) => (
            <StoryRow
              key={story.storyId}
              entry={story}
              depth={depth + 1}
              storyStates={storyStates}
              selection={selection}
              expansionMode={expansionMode}
              collapsedStoryId={collapsedStoryId}
              onSelect={onSelectStory}
              onSelectionChange={onSelectionChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StoryRow({
  entry,
  depth,
  storyStates,
  selection,
  expansionMode,
  collapsedStoryId,
  onSelect,
  onSelectionChange,
}: {
  readonly entry: StoryEntry;
  readonly depth: number;
  readonly storyStates: NonNullable<LaymosStoriesProps['storyStates']>;
  readonly selection: LaymosStoriesSelection;
  readonly expansionMode: LaymosStoriesSidebarExpansion;
  readonly collapsedStoryId: string | null;
  readonly onSelect: (entry: StoryEntry) => void;
  readonly onSelectionChange: (selection: LaymosStoriesSelection) => void;
}) {
  const execution = storyStates[entry.storyId];
  const selected =
    selection?.kind === 'story' && selection.storyId === entry.storyId;
  const open =
    collapsedStoryId !== entry.storyId &&
    (selection?.kind === 'story' || selection?.kind === 'scenario') &&
    selection.storyId === entry.storyId
      ? true
      : expansionMode === 'recursive' &&
        selection?.kind === 'group' &&
        storyGroupKey(entry.groupPath.slice(0, selection.groupPath.length)) ===
          storyGroupKey(selection.groupPath);
  return (
    <div style={{ paddingLeft: `${depth * 12 + 12}px` }}>
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
          {entry.storyId}
        </span>
      </button>
      {entry.artifact && open && (
        <div className="ml-3 border-l border-border pl-2">
          {entry.scenarios.map(({ scenarioIndex, scenario }) => {
            const scenarioSelected =
              selection?.kind === 'scenario' &&
              selection.storyId === entry.storyId &&
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
                    storyId: entry.storyId,
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
