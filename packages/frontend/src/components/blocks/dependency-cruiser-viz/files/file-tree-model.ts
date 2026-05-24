import type { ViewMode, VisualizationConfig, VizSummary } from '../types';
import {
  buildFileTree,
  collectAllFileIds,
  collectExpandedIds,
  filterTree,
} from './file-tree-data';
import {
  getConfiguredPaths,
  getCoverageStats,
  getFeatureFiles,
  getFeatureStatusOverrides,
  getHighlightedFiles,
  getLayerPathOrder,
  getPanelTitle,
  getRelevantPaths,
  getSortOrder,
} from './file-tree-selectors';
import type { FileTreeViewModel } from './file-tree-types';

export type {
  CoverageStatItem,
  FileStatus,
  FileTreeNode,
  FileTreeViewModel,
  ViolationItem,
} from './file-tree-types';

type FileTreeViewModelInput = {
  config: VisualizationConfig;
  summary: VizSummary;
  viewMode: ViewMode;
  selectedLayer: string | null;
  selectedLayerPaths: string[] | null;
  selectedFeature: string | null;
  hoveredFeaturePath: string | null;
  hideIrrelevantFiles: boolean;
};

export function getFileTreeViewModel({
  config,
  summary,
  viewMode,
  selectedLayer,
  selectedLayerPaths,
  selectedFeature,
  hoveredFeaturePath,
  hideIrrelevantFiles,
}: FileTreeViewModelInput): FileTreeViewModel {
  const tree = buildFileTree(summary);
  const isFeatureView = viewMode === 'features';
  const selectedLayerViolations = selectedLayer
    ? summary.violations.filter(
        (v) => v.from === selectedLayer || v.to === selectedLayer,
      )
    : [];
  const selectedFeatureViolations =
    selectedFeature && summary.featureViolations
      ? summary.featureViolations.filter(
          (v) => v.from === selectedFeature || v.to === selectedFeature,
        )
      : [];
  const featureFiles =
    isFeatureView && selectedFeature && summary.featureCoveredFiles
      ? getFeatureFiles(summary, selectedFeature)
      : null;
  const allFileIds = collectAllFileIds(tree);
  const configuredPaths = getConfiguredPaths(config);
  const layerOrder = getLayerPathOrder(config);
  const allRelevantPaths = getRelevantPaths({
    config,
    configuredPaths,
    isFeatureView,
    selectedFeature,
    selectedLayerPaths,
  });
  const displayTree =
    hideIrrelevantFiles && isFeatureView && featureFiles
      ? filterTree(tree, featureFiles)
      : tree;

  return {
    title: getPanelTitle(isFeatureView, selectedFeature),
    isFeatureView,
    selectedLayer,
    selectedLayerPaths,
    selectedFeature,
    hideIrrelevantFiles,
    stats: getCoverageStats({
      isFeatureView,
      selectedFeature,
      selectedFeatureViolations,
      summary,
    }),
    violations: isFeatureView
      ? selectedFeature
        ? selectedFeatureViolations
        : (summary.featureViolations ?? [])
      : selectedLayer
        ? selectedLayerViolations
        : summary.violations,
    tree: displayTree,
    treeKey: isFeatureView
      ? `feature-${selectedFeature ?? 'default'}-${hideIrrelevantFiles}`
      : `layer-${selectedLayer ?? 'default'}`,
    highlightedFiles: getHighlightedFiles({
      allFileIds,
      featureFiles,
      hoveredFeaturePath,
      isFeatureView,
      selectedLayer,
      summary,
    }),
    configuredPaths,
    sortOrder: getSortOrder({
      config,
      isFeatureView,
      selectedFeature,
      layerOrder,
    }),
    statusOverrides: getFeatureStatusOverrides(summary, isFeatureView),
    expandedItems: collectExpandedIds(allRelevantPaths),
  };
}
