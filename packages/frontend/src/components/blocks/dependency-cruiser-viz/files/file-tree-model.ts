import type { VisualizationConfig, VizSummary } from '../types';
import {
  buildFileTree,
  collectExpandedIds,
  filterTree,
} from './file-tree-data';
import {
  getAllFeatureCoveredFiles,
  getConfiguredPaths,
  getCoverageStats,
  getFeatureFiles,
  getFeatureViolationCounts,
  getHighlightedFiles,
  getLayerPathOrder,
  getSortOrder,
  getUncoveredFiles,
  getViolations,
} from './file-tree-selectors';
import type { FileTreeViewModel } from './file-tree-types';

export type {
  CoverageStatItem,
  FeatureViolationCount,
  FileStatus,
  FileTreeNode,
  FileTreeViewModel,
  ViolationItem,
} from './file-tree-types';

export const FEATURE_OVERVIEW = '__overview__';

type FileTreeViewModelInput = {
  config: VisualizationConfig;
  summary: VizSummary;
  selectedLayer: string | null;
  selectedLayerPaths: string[] | null;
  selectedFeature: string | null;
};

export function getFileTreeViewModel({
  config,
  summary,
  selectedLayer,
  selectedLayerPaths,
  selectedFeature,
}: FileTreeViewModelInput): FileTreeViewModel {
  const tree = buildFileTree(summary);
  const configuredPaths = getConfiguredPaths(config);
  const layerOrder = getLayerPathOrder(config);

  const isFeatureOverview = selectedFeature === FEATURE_OVERVIEW;
  const actualFeature =
    selectedFeature && !isFeatureOverview ? selectedFeature : null;

  const featureFiles = actualFeature
    ? getFeatureFiles(summary, actualFeature)
    : null;

  const allFeatureCovered = isFeatureOverview
    ? getAllFeatureCoveredFiles(summary)
    : null;

  const overviewFeatureFiles = allFeatureCovered;

  const displayTree =
    actualFeature && featureFiles ? filterTree(tree, featureFiles) : tree;

  const relevantPaths = actualFeature
    ? getFeaturePaths(summary, config, actualFeature)
    : (selectedLayerPaths ?? [...configuredPaths]);

  return {
    title: isFeatureOverview
      ? 'Feature Coverage'
      : actualFeature
        ? `Feature: ${actualFeature}`
        : 'File Coverage',
    selectedFeature,
    stats: getCoverageStats({
      summary,
      selectedLayer: isFeatureOverview ? null : selectedLayer,
      selectedFeature: actualFeature,
      isFeatureOverview,
    }),
    violations: getViolations({
      summary,
      selectedLayer: isFeatureOverview ? null : selectedLayer,
      selectedFeature: actualFeature,
      isFeatureOverview,
    }),
    featureViolationCounts: getFeatureViolationCounts(summary, config.features),
    tree: displayTree,
    treeKey: isFeatureOverview
      ? 'feature-overview'
      : actualFeature
        ? `feature-${actualFeature}`
        : `layer-${selectedLayer ?? 'default'}`,
    highlightedFiles: getHighlightedFiles({
      summary,
      selectedLayer: isFeatureOverview ? null : selectedLayer,
      featureFiles: featureFiles ?? overviewFeatureFiles,
    }),
    uncoveredFiles: allFeatureCovered ? getUncoveredFiles(summary) : null,
    configuredPaths,
    sortOrder: getSortOrder({
      config,
      selectedFeature: actualFeature,
      layerOrder,
    }),
    expandedItems: collectExpandedIds(relevantPaths),
  };
}

function getFeaturePaths(
  summary: VizSummary,
  config: VisualizationConfig,
  featureName: string,
): string[] {
  const graph = summary.featureGraphs?.find((g) => g.feature === featureName);
  if (graph) return graph.nodes.map((node) => node.file);
  const feat = config.features?.find((f) => f.name === featureName);
  return feat?.paths ?? [];
}
