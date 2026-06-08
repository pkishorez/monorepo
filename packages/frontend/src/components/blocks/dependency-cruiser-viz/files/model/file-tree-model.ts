import {
  featureFileSets,
  fileVisibility,
  moduleFiles,
  moduleVisibilityByPath,
  type VisualizationConfig,
  type VizSummary,
} from '../../model';
import { buildFileTree, collectModuleCollapsedIds } from './file-tree-data';
import {
  getConfiguredPaths,
  getCoverageGapFiles,
  getCoverageGapsByLayer,
  getCoverageStats,
  getHighlightedFiles,
  getLayerPaths,
  getLayerPathOrder,
  getModulePaths,
  getViolations,
} from './file-tree-selectors';
import type { FileTreeViewModel } from './file-tree-types';

export type {
  CoverageStatItem,
  FileStatus,
  FileTreeNode,
  FileTreeViewModel,
  NodeKind,
  ViolationItem,
} from './file-tree-types';

type FileTreeViewModelInput = {
  config: VisualizationConfig;
  summary: VizSummary;
  selectedLayer: string | null;
  selectedFeature: string | null;
  selectedModule?: string | null;
  hoveredGraphFiles?: Set<string> | null;
  hoveredModulePath?: string | null;
};

export function getFileTreeViewModel({
  config,
  summary,
  selectedLayer,
  selectedFeature,
  selectedModule,
  hoveredGraphFiles,
  hoveredModulePath,
}: FileTreeViewModelInput): FileTreeViewModel {
  const layerPaths = getLayerPaths(config);
  const modulePaths = getModulePaths(config);
  const tree = buildFileTree(summary, layerPaths, modulePaths);
  const configuredPaths = getConfiguredPaths(config);
  const layerOrder = getLayerPathOrder(config);

  // A feature reaches two tiers of files: the modules it OWNS (its own vertical
  // slice — strong highlight) and the shared modules it CONSUMES (subtle, marked
  // as borrowed). See model.featureFileSets. Highlighting is the ONLY
  // thing a feature changes; the tree's structure, order, and expansion are
  // always identical so it never remounts or reshuffles.
  const featureSets = selectedFeature
    ? featureFileSets(summary, selectedFeature)
    : null;

  // Module selection (mutually exclusive with feature) highlights that module's
  // files as a single tier-colored set; there's no owned/consumed split.
  const moduleSets =
    !selectedFeature && selectedModule
      ? (() => {
          const files = moduleFiles(summary).get(selectedModule);
          if (!files || files.length === 0) return null;
          return { owned: new Set(files), consumed: new Set<string>() };
        })()
      : null;

  const highlight = getHighlightedFiles({
    summary,
    selectedLayer,
    featureFileSets: featureSets ?? moduleSets,
  });

  const colorByTier = selectedFeature !== null || selectedModule != null;

  const coverageGapFiles = getCoverageGapFiles(summary);

  return {
    title: selectedFeature ? `Feature: ${selectedFeature}` : 'File Coverage',
    selectedFeature,
    stats: getCoverageStats({ summary, selectedLayer, selectedFeature }),
    violations: getViolations({ summary, selectedLayer, selectedFeature }),
    tree,
    // Stable across feature selection so the tree never remounts and its
    // expansion state is preserved; restyling alone reflects the feature.
    treeKey: 'tree',
    highlightedFiles: highlight.all,
    ownedFiles: highlight.owned,
    consumedFiles: highlight.consumed,
    // Per-file visibility tier; only consumed by the tree when a feature is
    // selected (so layer/coverage context coloring is unchanged).
    fileVisibility: fileVisibility(summary),
    // Module folders are tier-colored by their declared visibility, always
    // (independent of selection). Keyed by full module path = the folder id.
    moduleVisibility: moduleVisibilityByPath(config),
    // Color highlighted rows by tier whenever a feature OR a module is selected.
    colorByTier,
    coverageGapFiles,
    coverageGapsByLayer: getCoverageGapsByLayer(summary),
    configuredPaths,
    modulePaths,
    layerPaths,
    // Tree order is ALWAYS the stable layer order, independent of feature
    // selection — selecting a feature must never reorder the tree.
    sortOrder: layerOrder,
    // Default expansion opens every ancestor down to (and including the row
    // for) each module, leaving the module folder itself collapsed. Stable
    // across feature selection and hover so persistent expansion is preserved.
    expandedItems: collectModuleCollapsedIds(tree, layerPaths, modulePaths),
    hoveredGraphFiles: hoveredGraphFiles ?? null,
    hoveredModulePath: hoveredModulePath ?? null,
  };
}
