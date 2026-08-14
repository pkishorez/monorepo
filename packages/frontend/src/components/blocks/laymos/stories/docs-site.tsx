import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, FileText, PanelLeft } from 'lucide-react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import type { StoryTree } from 'laymos';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '#components/ui/resizable';
import { Button } from '#components/ui/button';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

import {
  countQuestions,
  groupVerdict,
  indexTree,
  isChapter,
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
  let displayed = selected;
  let focusStoryId: string | undefined;
  if (selected?.kind === 'story') {
    const parent = nodes.get(selected.parentId);
    if (parent?.kind === 'group' && isChapter(parent.group)) {
      displayed = parent;
      focusStoryId = selected.id;
    }
  }
  const sidebarRef = useRef<PanelImperativeHandle | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedChapterId, setExpandedChapterId] = useState<
    string | undefined
  >();
  let selectedChapterId: string | undefined;
  if (selected?.kind === 'group' && isChapter(selected.group)) {
    selectedChapterId = selected.id;
  } else if (selected?.kind === 'story') {
    const parent = nodes.get(selected.parentId);
    if (parent?.kind === 'group' && isChapter(parent.group)) {
      selectedChapterId = parent.id;
    }
  }

  useEffect(() => {
    if (selectedChapterId !== undefined) {
      setExpandedChapterId(selectedChapterId);
    }
  }, [selectedChapterId]);

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              const panel = sidebarRef.current;
              if (panel === null) return;
              if (panel.isCollapsed()) panel.expand();
              else panel.collapse();
            }}
            title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          >
            <PanelLeft className="size-4" />
          </Button>
          <span className="truncate text-sm font-semibold">{tree.title}</span>
        </div>
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
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel
          panelRef={sidebarRef}
          collapsible
          collapsedSize="0%"
          defaultSize="22%"
          minSize="160px"
          maxSize="40%"
          onResize={(size) => setSidebarCollapsed(size.asPercentage === 0)}
        >
          <nav className={cn('h-full overflow-y-auto py-2.5', scrollbarStyles)}>
            <SidebarGroup
              id={tree.title}
              group={tree}
              depth={0}
              reports={reports}
              selectedId={selected?.id}
              expandedChapterId={expandedChapterId}
              onExpandedChapterChange={setExpandedChapterId}
              onSelect={setSelectedId}
            />
          </nav>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize="78%" minSize="50%">
          <div
            className={cn(
              'h-full overflow-y-auto p-4 sm:px-8 sm:py-6',
              scrollbarStyles,
            )}
          >
            {displayed !== undefined && (
              <div className="mx-auto max-w-3xl">
                <NodePage
                  node={displayed}
                  reports={reports}
                  running={running}
                  onRun={onRun}
                  onSelect={setSelectedId}
                  focusStoryId={focusStoryId}
                />
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function SidebarGroup({
  id,
  group,
  depth,
  reports,
  selectedId,
  expandedChapterId,
  onExpandedChapterChange,
  onSelect,
}: {
  readonly id: string;
  readonly group: StoryTree;
  readonly depth: number;
  readonly reports?: StoryReports;
  readonly selectedId?: string;
  readonly expandedChapterId?: string;
  readonly onExpandedChapterChange: (id: string | undefined) => void;
  readonly onSelect: (id: string) => void;
}) {
  const chapter = isChapter(group);
  const [groupOpen, setGroupOpen] = useState(true);
  const selectedInside =
    selectedId !== undefined &&
    (selectedId === id || selectedId.startsWith(`${id}/`));
  const open = chapter ? expandedChapterId === id : groupOpen;
  useEffect(() => {
    if (!chapter && selectedInside) setGroupOpen(true);
  }, [chapter, selectedInside]);
  return (
    <div className="flex flex-col">
      <SidebarRow
        label={group.title}
        depth={depth}
        verdict={groupVerdict(group, reports)}
        count={isChapter(group) ? countQuestions(group) : undefined}
        selected={selectedId === id}
        emphasized
        onSelect={() => onSelect(id)}
        toggle={
          <span
            onClick={(event) => {
              event.stopPropagation();
              if (chapter) {
                onExpandedChapterChange(open ? undefined : id);
              } else {
                setGroupOpen((value) => !value);
              }
            }}
            className="rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                'size-3.5 transition-transform',
                open && 'rotate-90',
              )}
            />
          </span>
        }
      />
      {open &&
        group.stories.map((story) => (
          <SidebarRow
            key={story.id}
            label={story.title}
            depth={depth + 1}
            verdict={reports?.[story.id]?.verdict}
            selected={selectedId === story.id}
            leaf
            onSelect={() => onSelect(story.id)}
          />
        ))}
      {open &&
        group.groups.map((child) => (
          <SidebarGroup
            key={child.title}
            id={`${id}/${child.title}`}
            group={child}
            depth={depth + 1}
            reports={reports}
            selectedId={selectedId}
            expandedChapterId={expandedChapterId}
            onExpandedChapterChange={onExpandedChapterChange}
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
  count,
  selected,
  leaf = false,
  emphasized = false,
  onSelect,
  toggle,
}: {
  readonly label: string;
  readonly depth: number;
  readonly verdict?: 'passed' | 'failed' | 'errored';
  readonly count?: number;
  readonly selected: boolean;
  readonly leaf?: boolean;
  readonly emphasized?: boolean;
  readonly onSelect: () => void;
  readonly toggle?: ReactNode;
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
      <span className="flex size-4.5 shrink-0 items-center justify-center">
        {toggle ??
          (leaf && (
            <span
              className={cn(
                'flex size-4 items-center justify-center rounded border',
                selected
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border/70 bg-muted/60 text-muted-foreground/70',
              )}
            >
              <FileText className="size-2.5" />
            </span>
          ))}
      </span>
      <VerdictDot verdict={verdict} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground/60">
          {count}
        </span>
      )}
    </button>
  );
}
