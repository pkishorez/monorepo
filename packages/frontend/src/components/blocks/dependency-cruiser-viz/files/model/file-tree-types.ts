import type { TreeViewElement } from '#components/ui/file-tree';

import type { Breach, LayerConflict, Visibility } from '../../model';

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
  /**
   * Visibility tier of the declared module a node IS (its id matches a module
   * path) — module folders and single-file modules. Undefined for intermediate
   * folders and non-module files. Drives the Features-tab visibility dot.
   */
  visibility?: Visibility;
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
  selectedFeature: string | null;
  stats: CoverageStatItem[];
  violations: ViolationItem[];
  /** Active (selected/hovered) layer; dims violation rows not touching it. */
  activeLayer: string | null;
  /** Feature/visibility boundary breaches (static list, shown in the sidebar). */
  breaches: Breach[];
  /** Overlapping layer-pattern conflicts (static list, shown in the sidebar). */
  conflicts: LayerConflict[];
  tree: FileTreeNode[];
  treeKey: string;
  /**
   * Union of {@link ownedFiles} and {@link consumedFiles} — the full set a
   * feature (or layer) reaches. Drives folder containment and row dimming so a
   * file outside the selection is faded regardless of tier.
   */
  highlightedFiles: Set<string> | null;
  /**
   * Files of modules the selected feature OWNS (its own vertical slice), or a
   * selected layer's files. Rendered with the STRONG/primary highlight. Null
   * when nothing is selected.
   */
  ownedFiles: Set<string> | null;
  /**
   * Files of the shared/public modules the selected feature CONSUMES (borrows).
   * Rendered with the SUBTLE/secondary highlight plus a "borrowed" marker. Null
   * when no feature is selected (a bare layer selection has no consumed tier).
   */
  consumedFiles: Set<string> | null;
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
