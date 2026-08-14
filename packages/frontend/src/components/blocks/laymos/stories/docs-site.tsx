import { useMemo, useState } from 'react';
import type { StoryTree } from 'laymos';

import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

import {
  groupVerdict,
  indexTree,
  type StoriesViewProps,
  type StoryReports,
} from './model';
import { NodePage } from './pages';
import { RunHeader } from './run-header';
import { VerdictDot } from './timeline';

export function StoriesDocsSite({
  tree,
  reports,
  running,
  onRun,
  className,
}: StoriesViewProps) {
  const nodes = useMemo(() => indexTree(tree), [tree]);
  const [selectedId, setSelectedId] = useState(tree.title);
  const selected = nodes.get(selectedId) ?? nodes.get(tree.title);

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 sm:px-5">
        <span className="text-sm font-semibold">{tree.title}</span>
        <RunHeader
          tree={tree}
          reports={reports}
          running={running}
          onRun={onRun}
          selection={
            selected === undefined
              ? undefined
              : {
                  id: selected.id,
                  title:
                    selected.kind === 'group'
                      ? selected.group.title
                      : selected.story.title,
                }
          }
        />
      </div>
      <div className="flex min-h-0 flex-1">
        <nav
          className={cn(
            'w-60 shrink-0 overflow-y-auto border-r border-border py-3',
            scrollbarStyles,
          )}
        >
          <SidebarGroup
            id={tree.title}
            group={tree}
            depth={0}
            reports={reports}
            selectedId={selected?.id}
            onSelect={setSelectedId}
          />
        </nav>
        <div
          className={cn('flex-1 overflow-y-auto p-4 sm:p-6', scrollbarStyles)}
        >
          {selected !== undefined && (
            <NodePage
              node={selected}
              reports={reports}
              onSelect={setSelectedId}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SidebarGroup({
  id,
  group,
  depth,
  reports,
  selectedId,
  onSelect,
}: {
  readonly id: string;
  readonly group: StoryTree;
  readonly depth: number;
  readonly reports?: StoryReports;
  readonly selectedId?: string;
  readonly onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col">
      <SidebarRow
        label={group.title}
        depth={depth}
        verdict={groupVerdict(group, reports)}
        selected={selectedId === id}
        emphasized
        onSelect={() => onSelect(id)}
      />
      {group.stories.map((story) => (
        <SidebarRow
          key={story.id}
          label={story.title}
          depth={depth + 1}
          verdict={reports?.[story.id]?.verdict}
          selected={selectedId === story.id}
          onSelect={() => onSelect(story.id)}
        />
      ))}
      {group.groups.map((child) => (
        <SidebarGroup
          key={child.title}
          id={`${id}/${child.title}`}
          group={child}
          depth={depth + 1}
          reports={reports}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function SidebarRow({
  label,
  depth,
  verdict,
  selected,
  emphasized = false,
  onSelect,
}: {
  readonly label: string;
  readonly depth: number;
  readonly verdict?: 'passed' | 'failed' | 'errored';
  readonly selected: boolean;
  readonly emphasized?: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{ paddingLeft: `${12 + depth * 14}px` }}
      className={cn(
        'flex w-full items-center gap-2 py-1.5 pr-3 text-left text-sm transition-colors',
        selected
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        emphasized && 'font-medium text-foreground',
      )}
    >
      <VerdictDot verdict={verdict} />
      <span className="truncate">{label}</span>
    </button>
  );
}
