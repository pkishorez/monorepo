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
  groupChange,
  splitSpine,
  storyChange,
  type StoryLeaf,
  type ChangedPaths,
  type StoriesViewProps,
  type StoryChange,
  type StoryReports,
} from './model';
import { NodePage } from './pages';
import { RunHeader } from './run-header';
import { VerdictDot } from './timeline';

export type { StoriesViewProps, StoryReports } from './model';

export function StoriesDocsSite({
  tree,
  reports,
  changedPaths,
  running,
  onRun,
  className,
}: StoriesViewProps) {
  const nodes = useMemo(() => indexTree(tree), [tree]);
  const [selectedId, setSelectedId] = useState(tree.title);
  const selected = nodes.get(selectedId) ?? nodes.get(tree.title);
  const sidebarRef = useRef<PanelImperativeHandle | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedChapterId, setExpandedChapterId] = useState<
    string | undefined
  >();
  const selectedChapterId = chapterIdOf(nodes, selected);

  useEffect(() => {
    if (selectedChapterId !== undefined) {
      setExpandedChapterId(selectedChapterId);
    }
  }, [selectedChapterId]);

  // Selecting a row also reopens its chapter, which the effect above misses
  // when the same row is clicked again after collapsing it.
  const selectNode = (id: string) => {
    setSelectedId(id);
    const chapterId = chapterIdOf(nodes, nodes.get(id));
    if (chapterId !== undefined) setExpandedChapterId(chapterId);
  };

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
              nesting={0}
              reports={reports}
              changedPaths={changedPaths}
              selectedId={selected?.id}
              expandedChapterId={expandedChapterId}
              onExpandedChapterChange={setExpandedChapterId}
              onSelect={selectNode}
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
            {selected !== undefined && (
              <div className="mx-auto max-w-3xl">
                <NodePage
                  node={selected}
                  reports={reports}
                  running={running}
                  onRun={onRun}
                  onSelect={selectNode}
                />
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function chapterIdOf(
  nodes: ReturnType<typeof indexTree>,
  node: ReturnType<ReturnType<typeof indexTree>['get']>,
): string | undefined {
  if (node?.kind === 'group')
    return isChapter(node.group) ? node.id : undefined;
  if (node?.kind !== 'story') return undefined;
  const parent = nodes.get(node.parentId);
  return parent?.kind === 'group' && isChapter(parent.group)
    ? parent.id
    : undefined;
}

function SidebarGroup({
  id,
  group,
  nesting,
  reports,
  changedPaths,
  selectedId,
  expandedChapterId,
  onExpandedChapterChange,
  onSelect,
}: {
  readonly id: string;
  readonly group: StoryTree;
  readonly nesting: number;
  readonly reports?: StoryReports;
  readonly changedPaths?: ChangedPaths;
  readonly selectedId?: string;
  readonly expandedChapterId?: string;
  readonly onExpandedChapterChange: (id: string | undefined) => void;
  readonly onSelect: (id: string) => void;
}) {
  const chapter = isChapter(group);
  const [groupOpen, setGroupOpen] = useState(true);
  const [depthOpen, setDepthOpen] = useState(false);
  const { spine, depth } = splitSpine(group.stories);
  const storyRow = (story: StoryLeaf) => (
    <SidebarRow
      key={story.id}
      label={story.title}
      depth={nesting + 1}
      verdict={reports?.[story.id]?.verdict}
      change={
        changedPaths === undefined
          ? undefined
          : storyChange(story, changedPaths)
      }
      selected={selectedId === story.id}
      leaf
      onSelect={() => onSelect(story.id)}
    />
  );
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
        depth={nesting}
        verdict={groupVerdict(group, reports)}
        change={
          changedPaths === undefined
            ? undefined
            : groupChange(group, changedPaths)
        }
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
      {open && spine.map(storyRow)}
      {open && depthOpen && depth.map(storyRow)}
      {open && depth.length > 0 && (
        <button
          type="button"
          onClick={() => setDepthOpen((value) => !value)}
          style={{ paddingLeft: `${12 + (nesting + 1) * 14}px` }}
          className="flex w-full items-center gap-2 py-1 pr-3 text-left text-xs text-muted-foreground/70 transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <span className="size-4.5 shrink-0" />
          {depthOpen ? 'Less' : `${depth.length} more`}
        </button>
      )}
      {open &&
        group.groups.map((child) => (
          <SidebarGroup
            key={child.title}
            id={`${id}/${child.title}`}
            group={child}
            nesting={nesting + 1}
            reports={reports}
            changedPaths={changedPaths}
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
  change,
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
  readonly change?: StoryChange;
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
      {change !== undefined && <ChangeBadge change={change} />}
      {count !== undefined && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground/60">
          {count}
        </span>
      )}
    </button>
  );
}

function ChangeBadge({ change }: { readonly change: StoryChange }) {
  const label =
    change.status === 'added'
      ? 'Added'
      : change.supportOnly
        ? 'Support changed'
        : 'Modified';
  return (
    <span
      title={label}
      className={cn(
        'shrink-0 rounded-sm px-1 py-px text-[10px] font-medium uppercase tracking-wide',
        change.status === 'added'
          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
      )}
    >
      {change.status === 'added' ? 'new' : change.supportOnly ? 'sup' : 'mod'}
    </span>
  );
}
