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

type FeatureEntry = NonNullable<VisualizationConfig['features']>[number];

type FileTreePanelProps = {
  view: FileTreeViewModel;
  features?: VisualizationConfig['features'];
  onSelectFeature: (feature: string | null) => void;
};

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

type FeatureGroup = {
  name: string;
  color: string;
  features: FeatureEntry[];
};

function groupFeatures(features: FeatureEntry[]): {
  groups: FeatureGroup[];
  ungrouped: FeatureEntry[];
} {
  const groupMap = new Map<string, FeatureEntry[]>();
  const ungrouped: FeatureEntry[] = [];
  const groupOrder: string[] = [];

  for (const f of features) {
    if (f.group) {
      let list = groupMap.get(f.group);
      if (!list) {
        list = [];
        groupMap.set(f.group, list);
        groupOrder.push(f.group);
      }
      list.push(f);
    } else {
      ungrouped.push(f);
    }
  }

  const groups: FeatureGroup[] = groupOrder.map((name, i) => ({
    name,
    color: CHART_COLORS[i % CHART_COLORS.length]!,
    features: groupMap.get(name)!,
  }));

  return { groups, ungrouped };
}

export function FileTreePanel({
  view,
  features,
  onSelectFeature,
}: FileTreePanelProps) {
  const hasFeatures = (features ?? []).length > 0;
  const isOverview = view.selectedFeature === FEATURE_OVERVIEW;
  const hasViolations = view.violations.length > 0;

  const { groups, ungrouped } = hasFeatures
    ? groupFeatures(features!)
    : { groups: [], ungrouped: [] };

  return (
    <div className="flex h-full flex-col border-l border-border bg-background">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-4">
        <h3 className="text-sm font-semibold">{view.title}</h3>
        <CoverageStats stats={view.stats} />
      </div>

      {hasFeatures && (
        <div className="border-b border-border px-4 py-3">
          <div className="flex flex-col gap-2">
            <button
              onClick={() =>
                onSelectFeature(isOverview ? null : FEATURE_OVERVIEW)
              }
              className={cn(
                'w-fit rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                isOverview
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
              )}
            >
              overview
            </button>

            {groups.map((group) => (
              <div key={group.name} className="flex flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  {group.name}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {group.features.map((f) => (
                    <FeaturePill
                      key={f.name}
                      feature={f}
                      isSelected={view.selectedFeature === f.name}
                      violationCount={
                        view.featureViolationCounts.find(
                          (v) => v.featureName === f.name,
                        )?.count ?? 0
                      }
                      borderColor={group.color}
                      onSelect={onSelectFeature}
                    />
                  ))}
                </div>
              </div>
            ))}

            {ungrouped.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {ungrouped.map((f) => (
                  <FeaturePill
                    key={f.name}
                    feature={f}
                    isSelected={view.selectedFeature === f.name}
                    violationCount={
                      view.featureViolationCounts.find(
                        (v) => v.featureName === f.name,
                      )?.count ?? 0
                    }
                    onSelect={onSelectFeature}
                  />
                ))}
              </div>
            )}
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
                  featureSeedFiles={view.featureSeedFiles}
                  uncoveredFiles={view.uncoveredFiles}
                  configuredPaths={view.configuredPaths}
                  sortOrder={view.sortOrder}
                  hoveredGraphFiles={view.hoveredGraphFiles}
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
            featureSeedFiles={view.featureSeedFiles}
            uncoveredFiles={view.uncoveredFiles}
            configuredPaths={view.configuredPaths}
            sortOrder={view.sortOrder}
            hoveredGraphFiles={view.hoveredGraphFiles}
          />
        </div>
      )}
    </div>
  );
}

function FeaturePill({
  feature,
  isSelected,
  violationCount,
  borderColor,
  onSelect,
}: {
  feature: FeatureEntry;
  isSelected: boolean;
  violationCount: number;
  borderColor?: string;
  onSelect: (feature: string | null) => void;
}) {
  return (
    <button
      onClick={() => onSelect(isSelected ? null : feature.name)}
      className={cn(
        'relative rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
        isSelected
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
      )}
      style={
        borderColor
          ? { borderLeftWidth: 3, borderLeftColor: borderColor }
          : undefined
      }
    >
      {feature.name}
      {violationCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
          {violationCount}
        </span>
      )}
    </button>
  );
}
