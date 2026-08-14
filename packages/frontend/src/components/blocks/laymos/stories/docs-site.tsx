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
  const sidebarRef = useRef<PanelImperativeHandle | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
            selected === undefined || selected.kind === 'doc'
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
            {selected !== undefined && (
              <div className="mx-auto max-w-3xl">
                <NodePage
                  node={selected}
                  reports={reports}
                  running={running}
                  onRun={onRun}
                  onSelect={setSelectedId}
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
  onSelect,
}: {
  readonly id: string;
  readonly group: StoryTree;
  readonly depth: number;
  readonly reports?: StoryReports;
  readonly selectedId?: string;
  readonly onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const selectedInside =
    selectedId !== undefined && selectedId.startsWith(`${id}/`);
  useEffect(() => {
    if (selectedInside) setOpen(true);
  }, [selectedInside]);
  return (
    <div className="flex flex-col">
      <SidebarRow
        label={group.title}
        depth={depth}
        verdict={groupVerdict(group, reports)}
        selected={selectedId === id}
        emphasized
        onSelect={() => onSelect(id)}
        toggle={
          <span
            onClick={(event) => {
              event.stopPropagation();
              setOpen((value) => !value);
            }}
            className="-ml-1 rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
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
        group.docs.map((doc) => (
          <SidebarRow
            key={doc.id}
            label={doc.title}
            depth={depth + 1}
            doc
            selected={selectedId === doc.id}
            onSelect={() => onSelect(doc.id)}
          />
        ))}
      {open &&
        group.stories.map((story) => (
          <SidebarRow
            key={story.id}
            label={story.title}
            depth={depth + 1}
            verdict={reports?.[story.id]?.verdict}
            selected={selectedId === story.id}
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
  doc = false,
  selected,
  emphasized = false,
  onSelect,
  toggle,
}: {
  readonly label: string;
  readonly depth: number;
  readonly verdict?: 'passed' | 'failed' | 'errored';
  readonly doc?: boolean;
  readonly selected: boolean;
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
      {toggle}
      {doc ? (
        <FileText className="size-3 shrink-0 text-muted-foreground/70" />
      ) : (
        <VerdictDot verdict={verdict} />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}
