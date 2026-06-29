import {
  featureFileSets,
  moduleFiles,
  moduleVisibilityByPath,
  type VisualizationConfig,
  type VizSummary,
} from '../../model';
import {
  buildFileTree,
  collectExpandedForTarget,
  collectModuleCollapsedIds,
  computeFileStatuses,
  type CoverageMode,
} from './file-tree-data';
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
  /** Which coverage axis to color the tree by — follows the active canvas tab. */
  coverageMode: CoverageMode;
  hoveredGraphFiles?: Set<string> | null;
  hoveredModulePath?: string | null;
};

export function getFileTreeViewModel({
  config,
  summary,
  selectedLayer,
  selectedFeature,
  selectedModule,
  coverageMode,
  hoveredGraphFiles,
  hoveredModulePath,
}: FileTreeViewModelInput): FileTreeViewModel {
  const layerPaths = getLayerPaths(config);
  const modulePaths = getModulePaths(config);
  const tree = buildFileTree(
    computeFileStatuses(summary, coverageMode),
    layerPaths,
    modulePaths,
    moduleVisibilityByPath(config),
  );
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

  // In the Features tab the tree itself colors module coverage (gaps render as
  // orphan/uncovered), so the secondary "not in any module" marker + dialog are
  // redundant — suppress them. They remain the module hint on the Layers tab.
  const isFeatureCoverage = coverageMode === 'features';
  const coverageGapFiles = isFeatureCoverage
    ? new Set<string>()
    : getCoverageGapFiles(summary);

  // Selecting a module or layer focuses the tree on that subtree: fully expand
  // it and collapse everything else. The module key is `layer::name`, resolved
  // to its declared folder path; a layer name resolves to its (possibly many)
  // folder paths. Hover never drives expansion — only an explicit selection.
  const selectedModulePath = selectedModule
    ? modulePathByKey(config).get(selectedModule)
    : undefined;
  const selectedLayerPaths = selectedLayer
    ? layerPathsByName(config).get(selectedLayer)
    : undefined;

  const expansionTargets = selectedModulePath
    ? [selectedModulePath]
    : (selectedLayerPaths ?? []);

  const expandedItems =
    expansionTargets.length > 0
      ? [
          ...new Set(
            expansionTargets.flatMap((id) =>
              collectExpandedForTarget(tree, id),
            ),
          ),
        ]
      : collectModuleCollapsedIds(tree, layerPaths, modulePaths);

  const expansionSignal = selectedModule ?? selectedLayer ?? 'default';

  return {
    title: selectedFeature
      ? `Feature: ${selectedFeature}`
      : isFeatureCoverage
        ? 'Module Coverage'
        : 'File Coverage',
    selectedFeature,
    stats: getCoverageStats({
      summary,
      selectedLayer,
      selectedFeature,
      coverageMode,
    }),
    violations: getViolations({ summary, selectedFeature }),
    // The active (selected or hovered) layer — violation rows not touching it
    // are dimmed rather than filtered out, so the list never resizes.
    activeLayer: selectedLayer,
    breaches: summary.breaches,
    conflicts: summary.conflicts,
    tree,
    // Stable across feature selection so the tree never remounts and its
    // expansion state is preserved; restyling alone reflects the feature.
    treeKey: 'tree',
    highlightedFiles: highlight.all,
    ownedFiles: highlight.owned,
    consumedFiles: highlight.consumed,
    coverageGapFiles,
    coverageGapsByLayer: isFeatureCoverage
      ? []
      : getCoverageGapsByLayer(summary),
    configuredPaths,
    modulePaths,
    layerPaths,
    // Tree order is ALWAYS the stable layer order, independent of feature
    // selection — selecting a feature must never reorder the tree.
    sortOrder: layerOrder,
    // With nothing selected, open every ancestor down to (and including the row
    // for) each module, leaving the module folder collapsed. With a module or
    // layer selected, fully expand that subtree and collapse the rest.
    expandedItems,
    expansionSignal,
    expansionFocused: expansionTargets.length > 0,
    hoveredGraphFiles: hoveredGraphFiles ?? null,
    hoveredModulePath: hoveredModulePath ?? null,
  };
}

/** Map each module's `layer::name` key to its declared folder path (= node id). */
function modulePathByKey(config: VisualizationConfig): Map<string, string> {
  const byKey = new Map<string, string>();
  for (const m of config.modules ?? [])
    byKey.set(`${m.layer}::${m.name}`, m.path);
  return byKey;
}

/** Map each layer name to its declared folder paths (a layer may span several). */
function layerPathsByName(config: VisualizationConfig): Map<string, string[]> {
  const byName = new Map<string, string[]>();
  for (const stack of config.stacks) {
    for (const layer of stack.layers) {
      const existing = byName.get(layer.name) ?? [];
      existing.push(...layer.paths);
      byName.set(layer.name, existing);
    }
  }
  return byName;
}
