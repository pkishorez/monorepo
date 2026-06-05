import type { TreeViewElement } from '#components/ui/file-tree';

import type { Visibility } from '../../model';

export type FileStatus = 'covered' | 'violation' | 'orphan' | 'ignored';

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

export type CoverageStatItem = {
  key: string;
  status: FileStatus;
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
   * File path -> visibility tier of its owning module. Used to color the
   * highlighted rows by tier (green=public, yellow=shared, gray=private) when a
   * feature is selected; ignored otherwise.
   */
  fileVisibility: Map<string, Visibility>;
  /**
   * Full module path -> declared visibility tier. Used to color MODULE folder
   * rows by tier (green=public, yellow=shared, gray=private) at all times,
   * independent of selection (tier is a static property of the module).
   */
  moduleVisibility: Map<string, Visibility>;
  /**
   * Color highlighted file rows by their module's visibility tier. True when a
   * feature OR a module is selected; false in layer/coverage context.
   */
  colorByTier: boolean;
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
  hoveredGraphFiles: Set<string> | null;
  /** Full folder path of the canvas-hovered module, for transient highlight. */
  hoveredModulePath: string | null;
};
