import { cn } from '#lib/utils';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '#components/ui/resizable';

import type { VisualizationConfig } from '../types';
import { CoverageStats } from './coverage-stats';
import { FEATURE_OVERVIEW, type FileTreeViewModel } from './file-tree-model';
import { FileTreeView } from './file-tree-view';
import { ViolationList } from './violation-list';

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
  const isOverview = view.selectedFeature === FEATURE_OVERVIEW;
  const hasViolations = view.violations.length > 0;

  return (
    <div className="flex h-full flex-col border-l border-border bg-background">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-4">
        <h3 className="text-sm font-semibold">{view.title}</h3>
        <CoverageStats stats={view.stats} />
      </div>

      {hasFeatures && (
        <div className="border-b border-border px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() =>
                onSelectFeature(isOverview ? null : FEATURE_OVERVIEW)
              }
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                isOverview
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
              )}
            >
              overview
            </button>
            {features!.map((f) => {
              const vc = view.featureViolationCounts.find(
                (v) => v.featureName === f.name,
              );
              const isSelected = view.selectedFeature === f.name;
              return (
                <button
                  key={f.name}
                  onClick={() => onSelectFeature(isSelected ? null : f.name)}
                  className={cn(
                    'relative rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                    isSelected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
                  )}
                >
                  {f.name}
                  {vc && vc.count > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
                      {vc.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasViolations ? (
        <div className="min-h-0 flex-1">
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize={70} minSize={20}>
              <div className="h-full overflow-auto">
                <FileTreeView
                  tree={view.tree}
                  treeKey={view.treeKey}
                  expandedItems={view.expandedItems}
                  highlightedFiles={view.highlightedFiles}
                  uncoveredFiles={view.uncoveredFiles}
                  configuredPaths={view.configuredPaths}
                  sortOrder={view.sortOrder}
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
            tree={view.tree}
            treeKey={view.treeKey}
            expandedItems={view.expandedItems}
            highlightedFiles={view.highlightedFiles}
            uncoveredFiles={view.uncoveredFiles}
            configuredPaths={view.configuredPaths}
            sortOrder={view.sortOrder}
          />
        </div>
      )}
    </div>
  );
}
