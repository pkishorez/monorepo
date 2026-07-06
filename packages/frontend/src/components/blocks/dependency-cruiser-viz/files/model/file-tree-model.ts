import {
  describeRules,
  moduleFiles,
  type VisualizationConfig,
  type VizSummary,
} from '../../model';
import {
  buildFileTree,
  collectExpandedForTarget,
  collectTopLevelExpandedIds,
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
  /** Module owning the graph (right-click) — primary emphasis. */
  selectedModule?: string | null;
  /** Module the tree points at (left-click) — secondary emphasis. */
  highlightedModule?: string | null;
  /** Which coverage axis to color the tree by — follows the active canvas tab. */
  coverageMode: CoverageMode;
  hoveredGraphFiles?: Set<string> | null;
  hoveredModulePath?: string | null;
};

export function getFileTreeViewModel({
  config,
  summary,
  selectedLayer,
  selectedModule,
  highlightedModule,
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
  );
  const configuredPaths = getConfiguredPaths(config);
  const layerOrder = getLayerPathOrder(config);

  // Module selection/highlight emphasizes those modules' files. Emphasis is
  // the ONLY thing it changes; the tree's structure and order are always
  // identical so it never remounts or reshuffles.
  const filesByModule = moduleFiles(summary);
  const resolveModuleSet = (key: string | null | undefined) => {
    if (!key) return null;
    const files = filesByModule.get(key);
    return files && files.length > 0 ? new Set(files) : null;
  };
  const selectedSet = resolveModuleSet(selectedModule);
  const highlightedSet = resolveModuleSet(highlightedModule);

  const highlight = getHighlightedFiles({
    summary,
    selectedLayer,
    selectedModuleFiles: selectedSet,
    highlightedModuleFiles: highlightedSet,
  });

  // In the Modules tab the tree itself colors module coverage (gaps render as
  // orphan/uncovered), so the secondary "not in any module" marker + dialog are
  // redundant — suppress them. They remain the module hint on the Layers tab.
  const isModuleCoverage = coverageMode === 'modules';
  const coverageGapFiles = isModuleCoverage
    ? new Set<string>()
    : getCoverageGapFiles(summary);

  // Selecting/highlighting a module (or selecting a layer) focuses the tree on
  // those subtrees: fully expand them and collapse everything else. The module
  // key is `layer::name`, resolved to its declared folder path; a layer name
  // resolves to its (possibly many) folder paths. Hover never drives expansion.
  const pathByKey = modulePathByKey(config);
  const modulePathTargets = [selectedModule, highlightedModule].flatMap(
    (key) => {
      const path = key ? pathByKey.get(key) : undefined;
      return path ? [path] : [];
    },
  );
  const selectedLayerPaths = selectedLayer
    ? layerPathsByName(config).get(selectedLayer)
    : undefined;

  const expansionTargets =
    modulePathTargets.length > 0
      ? modulePathTargets
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
      : collectTopLevelExpandedIds(tree);

  const expansionSignal =
    selectedModule || highlightedModule
      ? `${selectedModule ?? ''}|${highlightedModule ?? ''}`
      : (selectedLayer ?? 'default');

  return {
    title: isModuleCoverage ? 'Module Coverage' : 'File Coverage',
    stats: getCoverageStats({
      summary,
      selectedLayer,
      coverageMode,
    }),
    violations: getViolations({ summary }),
    // The active (selected or hovered) layer — violation rows not touching it
    // are dimmed rather than filtered out, so the list never resizes.
    activeLayer: selectedLayer,
    conflicts: summary.conflicts,
    moduleOverlaps: summary.moduleOverlaps,
    moduleViolations: summary.moduleViolations,
    tree,
    // Stable across selection so the tree never remounts and its expansion
    // state is preserved; restyling alone reflects the selection.
    treeKey: 'tree',
    highlightedFiles: highlight.all,
    ownedFiles: highlight.owned,
    highlightedModuleFiles: highlight.secondary,
    coverageGapFiles,
    coverageGapsByLayer: isModuleCoverage
      ? []
      : getCoverageGapsByLayer(summary),
    configuredPaths,
    modulePaths,
    ruleCountByPath: ruleCountByPath(config),
    layerPaths,
    // Tree order is ALWAYS the stable layer order, independent of selection —
    // selecting a module must never reorder the tree.
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

/** Number of declared rules per module path, for the row badge. */
function ruleCountByPath(config: VisualizationConfig): Map<string, number> {
  const byPath = new Map<string, number>();
  for (const m of config.modules ?? []) {
    const count = describeRules(m.rules).length;
    if (count > 0) byPath.set(m.path, count);
  }
  return byPath;
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
