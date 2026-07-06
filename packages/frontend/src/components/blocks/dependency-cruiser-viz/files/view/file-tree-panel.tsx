import { useEffect, useMemo, useState } from 'react';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '#components/ui/resizable';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#components/ui/dialog';
import { ScrollArea } from '#components/ui/scroll-area';

import type { FileTreeViewModel } from '../model/file-tree-model';
import { CoverageStats } from './coverage-stats';
import {
  collectAllFolderIds,
  filterByStatus,
  FileTreeView,
} from './file-tree-view';
import { ViolationList } from './violation-list';
import { ConflictList } from './conflict-list';
import { ModuleOverlapList } from './module-overlap-list';
import { ModuleViolationList } from './module-violation-list';
import type { FileStatus, ViolationItem } from '../model/file-tree-types';

type FileTreePanelProps = {
  view: FileTreeViewModel;
  canvasMode: 'layers' | 'modules';
  selectedViolation: ViolationItem | null;
  onSelectViolation: (violation: ViolationItem | null) => void;
};

export function FileTreePanel({
  view,
  canvasMode,
  selectedViolation,
  onSelectViolation,
}: FileTreePanelProps) {
  // Issues are surfaced alongside the canvas where they're actionable: the
  // Layers tab owns the layer axis (violations + path conflicts).
  const isLayers = canvasMode === 'layers';
  // The Layers tab owns the layer axis (violations + path conflicts); the
  // Modules tab owns module hygiene (rule violations + overlapping/nested
  // declarations).
  const hasIssues = isLayers
    ? view.violations.length > 0 || view.conflicts.length > 0
    : view.moduleOverlaps.length > 0 || view.moduleViolations.length > 0;

  // Clicking a coverage stat focuses the tree on just that status; clicking the
  // same stat again clears it. Reset when switching tabs so a filter never
  // carries over into the other tab's (differently-meaning) coverage.
  const [statusFilter, setStatusFilter] = useState<FileStatus | null>(null);
  useEffect(() => setStatusFilter(null), [canvasMode]);

  const tree = useMemo(
    () => (statusFilter ? filterByStatus(view.tree, statusFilter) : view.tree),
    [view.tree, statusFilter],
  );

  // When a status filter is active, fully expand the (pruned) tree so every
  // matching file is visible; otherwise defer to the model's intent.
  const isPruned = statusFilter !== null;
  const expandedItems = useMemo(
    () => (isPruned ? collectAllFolderIds(tree) : view.expandedItems),
    [isPruned, tree, view.expandedItems],
  );
  const expansionSignal = isPruned
    ? `filter:${statusFilter}`
    : view.expansionSignal;

  const showGaps = view.coverageGapsByLayer.length > 0;
  const gapTotal = view.coverageGapsByLayer.reduce(
    (sum, g) => sum + g.files.length,
    0,
  );

  const treeView = (
    <FileTreeView
      tree={tree}
      treeKey={view.treeKey}
      expandedItems={expandedItems}
      expansionSignal={expansionSignal}
      expansionFocused={view.expansionFocused || isPruned}
      highlightedFiles={view.highlightedFiles}
      ownedFiles={view.ownedFiles}
      highlightedModuleFiles={view.highlightedModuleFiles}
      coverageGapFiles={view.coverageGapFiles}
      configuredPaths={view.configuredPaths}
      modulePaths={view.modulePaths}
      ruleCountByPath={view.ruleCountByPath}
      layerPaths={view.layerPaths}
      sortOrder={view.sortOrder}
      hoveredGraphFiles={view.hoveredGraphFiles}
      hoveredModulePath={view.hoveredModulePath}
    />
  );

  return (
    <div className="flex h-full flex-col border-l border-border bg-background">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-4">
        <h3 className="text-sm font-semibold">{view.title}</h3>
        <CoverageStats
          stats={view.stats}
          activeStatus={statusFilter}
          onToggleStatus={(status) =>
            setStatusFilter((prev) => (prev === status ? null : status))
          }
        />
      </div>

      {hasIssues ? (
        <div className="min-h-0 flex-1">
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize={70} minSize={20}>
              <div className="h-full overflow-auto">{treeView}</div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={30} minSize={10}>
              <div className="h-full overflow-auto">
                {isLayers ? (
                  <>
                    <ViolationList
                      violations={view.violations}
                      activeLayer={view.activeLayer}
                      selectedViolation={selectedViolation}
                      onSelect={onSelectViolation}
                    />
                    <ConflictList conflicts={view.conflicts} />
                  </>
                ) : (
                  <>
                    <ModuleViolationList violations={view.moduleViolations} />
                    <ModuleOverlapList overlaps={view.moduleOverlaps} />
                  </>
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">{treeView}</div>
      )}

      {showGaps && (
        <CoverageGapSummary
          total={gapTotal}
          gapsByLayer={view.coverageGapsByLayer}
        />
      )}
    </div>
  );
}

function CoverageGapSummary({
  total,
  gapsByLayer,
}: {
  total: number;
  gapsByLayer: Array<{ layer: string; files: string[] }>;
}) {
  return (
    <div className="shrink-0 border-t border-border px-3 py-2">
      <Dialog>
        <DialogTrigger className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <span>
            <span className="font-medium text-foreground">{total}</span> file
            {total === 1 ? '' : 's'} not in any module
          </span>
          <span className="text-[10px] uppercase tracking-wider">view</span>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Files in a layer but not covered by any module
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="flex flex-col gap-3 pr-3">
              {gapsByLayer.map((g) => (
                <div key={g.layer} className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {g.layer}
                  </span>
                  <ul className="flex flex-col gap-0.5 text-muted-foreground">
                    {g.files.map((f) => (
                      <li key={f} className="truncate font-mono text-[11px]">
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
