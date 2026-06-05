import { Boxes, Eye, EyeOff } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import { cn } from '#lib/utils';

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

import type { VisualizationConfig } from '../../model';
import type { FileTreeViewModel } from '../model/file-tree-model';
import { CoverageStats } from './coverage-stats';
import { filterTree, FileTreeView } from './file-tree-view';
import { ViolationList } from './violation-list';

type FeatureEntry = NonNullable<VisualizationConfig['features']>[number];

type FileTreePanelProps = {
  view: FileTreeViewModel;
  features?: VisualizationConfig['features'];
  onSelectFeature: (feature: string | null) => void;
};

export function FileTreePanel({
  view,
  features,
  onSelectFeature,
}: FileTreePanelProps) {
  const hasFeatures = (features ?? []).length > 0;
  const hasViolations = view.violations.length > 0;

  // Local, session-scoped view filters layered on top of the (feature- and
  // expansion-independent) tree model. Both default to showing everything.
  const [hideNonModules, setHideNonModules] = useState(false);
  const [hideIgnored, setHideIgnored] = useState(false);

  const tree = useMemo(
    () =>
      filterTree(view.tree, {
        hideNonModules,
        hideIgnored,
        modulePaths: view.modulePaths,
        layerPaths: view.layerPaths,
      }),
    [view.tree, view.modulePaths, view.layerPaths, hideNonModules, hideIgnored],
  );

  const showGaps = view.coverageGapsByLayer.length > 0;
  const gapTotal = view.coverageGapsByLayer.reduce(
    (sum, g) => sum + g.files.length,
    0,
  );

  return (
    <div className="flex h-full flex-col border-l border-border bg-background">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{view.title}</h3>
          <div className="flex shrink-0 items-center gap-1">
            <ToolbarToggle
              active={hideNonModules}
              onToggle={() => setHideNonModules((v) => !v)}
              label="modules only"
              title={
                hideNonModules
                  ? 'Show all folders and files'
                  : 'Show only layers and modules'
              }
            >
              <Boxes className="size-3.5" />
            </ToolbarToggle>
            <ToolbarToggle
              active={!hideIgnored}
              onToggle={() => setHideIgnored((v) => !v)}
              label="ignored"
              title={hideIgnored ? 'Show ignored files' : 'Hide ignored files'}
            >
              {hideIgnored ? (
                <EyeOff className="size-3.5" />
              ) : (
                <Eye className="size-3.5" />
              )}
            </ToolbarToggle>
          </div>
        </div>
        <CoverageStats stats={view.stats} />
      </div>

      {hasFeatures && (
        <div className="border-b border-border px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => onSelectFeature(null)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                view.selectedFeature === null
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
              )}
            >
              architecture
            </button>
            {features!.map((f) => (
              <FeaturePill
                key={f.name}
                feature={f}
                isSelected={view.selectedFeature === f.name}
                onSelect={onSelectFeature}
              />
            ))}
          </div>
        </div>
      )}

      {hasViolations ? (
        <div className="min-h-0 flex-1">
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize={70} minSize={20}>
              <div className="h-full overflow-auto">
                <FileTreeView
                  tree={tree}
                  treeKey={view.treeKey}
                  expandedItems={view.expandedItems}
                  highlightedFiles={view.highlightedFiles}
                  ownedFiles={view.ownedFiles}
                  consumedFiles={view.consumedFiles}
                  colorByTier={view.colorByTier}
                  fileVisibility={view.fileVisibility}
                  moduleVisibility={view.moduleVisibility}
                  coverageGapFiles={view.coverageGapFiles}
                  configuredPaths={view.configuredPaths}
                  sortOrder={view.sortOrder}
                  hoveredGraphFiles={view.hoveredGraphFiles}
                  hoveredModulePath={view.hoveredModulePath}
                />
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={30} minSize={10}>
              <ViolationList violations={view.violations} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <FileTreeView
            tree={tree}
            treeKey={view.treeKey}
            expandedItems={view.expandedItems}
            highlightedFiles={view.highlightedFiles}
            ownedFiles={view.ownedFiles}
            consumedFiles={view.consumedFiles}
            colorByTier={view.colorByTier}
            fileVisibility={view.fileVisibility}
            moduleVisibility={view.moduleVisibility}
            coverageGapFiles={view.coverageGapFiles}
            configuredPaths={view.configuredPaths}
            sortOrder={view.sortOrder}
            hoveredGraphFiles={view.hoveredGraphFiles}
            hoveredModulePath={view.hoveredModulePath}
          />
        </div>
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

function ToolbarToggle({
  active,
  onToggle,
  label,
  title,
  children,
}: {
  active: boolean;
  onToggle: () => void;
  label: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={title}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
      )}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

function FeaturePill({
  feature,
  isSelected,
  onSelect,
}: {
  feature: FeatureEntry;
  isSelected: boolean;
  onSelect: (feature: string | null) => void;
}) {
  return (
    <button
      onClick={() => onSelect(isSelected ? null : feature.name)}
      title={feature.description}
      className={cn(
        'relative rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
        isSelected
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
      )}
    >
      {feature.name}
    </button>
  );
}
