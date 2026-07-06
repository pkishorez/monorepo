import type { TreeViewElement } from '#components/ui/file-tree';

import type {
  LayerConflict,
  ModuleOverlap,
  ModuleViolation,
} from '../../model';

export type FileStatus = 'covered' | 'orphan' | 'ignored';

/**
 * The structural role of a tree node, used for color-coding:
 * - `layer`: a configured layer path (a horizontal boundary)
 * - `module`: a declared module folder within a layer
 * - `other`: any non-module folder or file
 */
export type NodeKind = 'layer' | 'module' | 'other';

export type FileTreeNode = TreeViewElement & {
  status?: FileStatus;
  nodeKind?: NodeKind;
  children?: FileTreeNode[];
};

export type ViolationItem = {
  from: string;
  to: string;
  fromFile: string;
  toFile: string;
};

/** Coverage-summary rows also report violations, which are not a file status. */
export type StatKind = FileStatus | 'violation';

export type CoverageStatItem = {
  key: string;
  status: StatKind;
  count: number;
  label: string;
  hidden?: boolean;
  muted?: boolean;
};

export type FileTreeViewModel = {
  title: string;
  stats: CoverageStatItem[];
  violations: ViolationItem[];
  /** Active (selected/hovered) layer; dims violation rows not touching it. */
  activeLayer: string | null;
  /** Overlapping layer-pattern conflicts (static list, shown in the sidebar). */
  conflicts: LayerConflict[];
  /** Hierarchical (nested) module declarations — shown as violations on the
   * Modules tab, where modules must be exhaustive and mutually exclusive. */
  moduleOverlaps: ModuleOverlap[];
  /** Cross-module imports breaking a declared module rule — shown as
   * violations on the Modules tab. */
  moduleViolations: ModuleViolation[];
  tree: FileTreeNode[];
  treeKey: string;
  /**
   * The full set a selected module (or layer) reaches. Drives folder
   * containment and row dimming so a file outside the selection is faded.
   */
  highlightedFiles: Set<string> | null;
  /**
   * Files of the selected module (the one owning the graph), or a selected
   * layer's files. Rendered with the primary emphasis. Null when nothing is
   * selected.
   */
  ownedFiles: Set<string> | null;
  /**
   * Files of the highlighted module (left-click pointer). Rendered with a
   * secondary emphasis, distinguishable from {@link ownedFiles}.
   */
  highlightedModuleFiles: Set<string> | null;
  /**
   * Files inside a declared layer but in no declared module (coverage gaps),
   * shown distinctly so they can be promoted into a module.
   */
  coverageGapFiles: Set<string>;
  /** Coverage gaps grouped by layer, for the bottom-pinned dialog. */
  coverageGapsByLayer: Array<{ layer: string; files: string[] }>;
  configuredPaths: Set<string>;
  /** Module folder ids — used for color-coding and collapse-to-module. */
  modulePaths: Set<string>;
  /** Rules configured per module path — shown as a count beside the row. */
  ruleCountByPath: Map<string, number>;
  /** Layer folder ids — used for color-coding. */
  layerPaths: Set<string>;
  sortOrder: Map<string, number>;
  expandedItems: string[];
  /**
   * Identity of the current expansion intent (selected module/layer, or
   * `'default'`). The tree re-applies {@link expandedItems} only when this
   * changes, so manual expand/collapse persists between selections.
   */
  expansionSignal: string;
  /**
   * Whether {@link expandedItems} represents a transient FOCUS on a selected
   * module/layer (true) versus the baseline view (false). The tree snapshots the
   * user's expansion on entering focus and restores it when focus clears, so a
   * hover/selection never clobbers the manual expand/collapse state.
   */
  expansionFocused: boolean;
  hoveredGraphFiles: Set<string> | null;
  /** Full folder path of the canvas-hovered module, for transient highlight. */
  hoveredModulePath: string | null;
};
