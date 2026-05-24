import { EyeIcon, EyeOffIcon, FolderOpenIcon } from 'lucide-react';

import { cn } from '#lib/utils';

import { CoverageStats } from './coverage-stats';
import type { FileTreeViewModel } from './file-tree-model';
import { FileTreeView } from './file-tree-view';
import { ViolationList } from './violation-list';

type FileTreePanelProps = {
  view: FileTreeViewModel;
  onToggleHideIrrelevant: () => void;
};

export function FileTreePanel({
  view,
  onToggleHideIrrelevant,
}: FileTreePanelProps) {
  return (
    <div className="flex h-full flex-col border-l border-border bg-background">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{view.title}</h3>
          {view.isFeatureView && (
            <button
              onClick={onToggleHideIrrelevant}
              title={
                view.hideIrrelevantFiles
                  ? 'Show all files'
                  : 'Hide irrelevant files'
              }
              className={cn(
                'rounded-md p-1 transition-colors hover:bg-muted',
                view.hideIrrelevantFiles
                  ? 'text-primary'
                  : 'text-muted-foreground',
              )}
            >
              {view.hideIrrelevantFiles ? (
                <EyeOffIcon className="size-4" />
              ) : (
                <EyeIcon className="size-4" />
              )}
            </button>
          )}
        </div>
        <CoverageStats stats={view.stats} />
      </div>
      {!view.isFeatureView && (
        <div className="border-b border-border px-4 py-3">
          {view.selectedLayer && view.selectedLayerPaths ? (
            <div className="flex flex-col gap-1.5">
              <h4 className="text-xs font-semibold text-primary">
                {view.selectedLayer}
              </h4>
              <div className="flex flex-col gap-0.5">
                {view.selectedLayerPaths.map((p) => (
                  <span
                    key={p}
                    className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground"
                  >
                    <FolderOpenIcon className="size-3 shrink-0" />
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/50">
              Hover or click a layer to see its paths
            </span>
          )}
        </div>
      )}
      <ViolationList violations={view.violations} />
      {view.isFeatureView && !view.selectedFeature && (
        <div className="border-b border-border px-4 py-3">
          <span className="text-xs text-muted-foreground/50">
            Click a feature to see its files
          </span>
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <FileTreeView
          tree={view.tree}
          treeKey={view.treeKey}
          expandedItems={view.expandedItems}
          highlightedFiles={view.highlightedFiles}
          configuredPaths={view.configuredPaths}
          sortOrder={view.sortOrder}
          statusOverrides={view.statusOverrides}
        />
      </div>
    </div>
  );
}
