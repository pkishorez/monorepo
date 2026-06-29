import { XIcon } from 'lucide-react';
import {
  File,
  Folder,
  Tree,
  type TreeViewElement,
} from '#components/ui/file-tree';
import { cn } from '#lib/utils';
import type { CSSProperties, ReactNode } from 'react';

import { VISIBILITY_COLOR } from '../../model';
import type { FileStatus, FileTreeNode } from '../model/file-tree-model';
import { StatusIcon } from './status-icon';

type FileTreeViewProps = {
  tree: FileTreeNode[];
  treeKey: string;
  expandedItems: string[];
  /** Identity of the expansion intent; re-applies expandedItems when it changes. */
  expansionSignal: string;
  /** True while expandedItems is a transient focus to snap to (and revert from). */
  expansionFocused: boolean;
  /** Union of owned ∪ consumed — drives containment and dimming. */
  highlightedFiles: Set<string> | null;
  /** Files the feature/layer OWNS — strong primary highlight. */
  ownedFiles: Set<string> | null;
  /** Files the feature CONSUMES (borrows) — subtle highlight + marker. */
  consumedFiles: Set<string> | null;
  /** Coverage-gap files: in a layer but no declared module. */
  coverageGapFiles: Set<string>;
  configuredPaths: Set<string>;
  sortOrder: Map<string, number>;
  hoveredGraphFiles: Set<string> | null;
  /** Full folder path of the canvas-hovered module, for transient highlight. */
  hoveredModulePath: string | null;
  /**
   * Show the per-module visibility dot (private/shared/public). Scoped to the
   * Features tab, where visibility tiers are the active axis.
   */
  showVisibility: boolean;
};

export function FileTreeView({
  tree,
  treeKey,
  expandedItems,
  expansionSignal,
  expansionFocused,
  highlightedFiles,
  ownedFiles,
  consumedFiles,
  coverageGapFiles,
  configuredPaths,
  sortOrder,
  hoveredGraphFiles,
  hoveredModulePath,
  showVisibility,
}: FileTreeViewProps) {
  // Coverage of each folder's leaf files against the active highlight, used to
  // dim untouched branches and to mark folders as fully / partially covered.
  const folderCoverage = new Map<string, FolderCoverage>();
  computeFolderCoverage(tree, highlightedFiles, folderCoverage);

  return (
    <Tree
      key={treeKey}
      elements={tree as TreeViewElement[]}
      initialExpandedItems={expandedItems}
      expandedItems={expandedItems}
      expansionSignal={expansionSignal}
      expansionFocused={expansionFocused}
    >
      {renderNodes({
        nodes: tree,
        highlightedFiles,
        ownedFiles,
        consumedFiles,
        coverageGapFiles,
        configuredPaths,
        sortOrder,
        hoveredGraphFiles,
        hoveredModulePath,
        folderCoverage,
        showVisibility,
      })}
    </Tree>
  );
}

/** Covered vs total leaf-file counts for a folder's subtree. */
type FolderCoverage = { covered: number; total: number };

/**
 * Walk the tree once, recording for each folder how many of its leaf files fall
 * within `highlightedFiles`. Folders with zero covered leaves are dimmed;
 * folders whose every leaf is covered get the full-row highlight.
 */
function computeFolderCoverage(
  nodes: FileTreeNode[],
  highlightedFiles: Set<string> | null,
  out: Map<string, FolderCoverage>,
): FolderCoverage {
  let covered = 0;
  let total = 0;
  for (const node of nodes) {
    if (node.type === 'file') {
      total += 1;
      if (highlightedFiles?.has(node.id)) covered += 1;
      continue;
    }
    const childCoverage = computeFolderCoverage(
      node.children ?? [],
      highlightedFiles,
      out,
    );
    out.set(node.id, childCoverage);
    covered += childCoverage.covered;
    total += childCoverage.total;
  }
  return { covered, total };
}

/**
 * A declared module is signalled by tinting its ICON (folder icon, or a file's
 * status icon) with the visibility-tier color — the same palette as the
 * Features canvas. The color is passed as a CSS variable so the inline HSL can
 * drive a Tailwind arbitrary `[&_svg]` rule; the descendant selector outranks a
 * status icon's own color (so the icon recolors while its SHAPE still reads as
 * the coverage status). Absence of a tint marks a plain (non-module) node. The
 * tint is Features-tab only. Layers keep their own sky icon (handled upstream).
 */
const VISIBILITY_ICON = '[&_svg]:text-[var(--viz-visibility)]';

function visibilityVar(
  visibility: NonNullable<FileTreeNode['visibility']>,
): CSSProperties {
  return { '--viz-visibility': VISIBILITY_COLOR[visibility] } as CSSProperties;
}

function renderNodes({
  nodes,
  highlightedFiles,
  ownedFiles,
  consumedFiles,
  coverageGapFiles,
  configuredPaths,
  sortOrder,
  hoveredGraphFiles,
  hoveredModulePath,
  folderCoverage,
  showVisibility,
}: {
  nodes: FileTreeNode[];
  highlightedFiles: Set<string> | null;
  ownedFiles: Set<string> | null;
  consumedFiles: Set<string> | null;
  coverageGapFiles: Set<string>;
  configuredPaths: Set<string>;
  sortOrder: Map<string, number>;
  hoveredGraphFiles: Set<string> | null;
  hoveredModulePath: string | null;
  folderCoverage: Map<string, FolderCoverage>;
  showVisibility: boolean;
}): ReactNode {
  const sorted = [...nodes].sort((a, b) => {
    const orderA = sortOrder.get(a.id);
    const orderB = sortOrder.get(b.id);
    if (orderA != null && orderB != null) return orderA - orderB;
    if (orderA != null) return -1;
    if (orderB != null) return 1;
    return a.name.localeCompare(b.name);
  });

  return sorted.map((node) => {
    if (node.type === 'folder') {
      const isConfigured = configuredPaths.has(node.id);
      const isLayer = node.nodeKind === 'layer';
      const isModule = node.nodeKind === 'module';
      // An intermediate folder is any non-module, non-layer grouping folder.
      const isIntermediate = !isLayer && !isModule;
      const isHoveredModuleFolder =
        hoveredModulePath != null && node.id === hoveredModulePath;
      // A module folder tints its icon by visibility tier (Features tab only).
      // Layers keep their own sky icon, so only true modules tint.
      const tintIcon = showVisibility && isModule && node.visibility != null;

      // While a highlight is active, fold the folder's leaf coverage into the
      // row: fully-covered folders carry the same primary fill as owned files,
      // partially-covered ones a subtler tint, and untouched branches dim.
      const coverage = folderCoverage.get(node.id);
      const isFullyCovered =
        highlightedFiles != null &&
        coverage != null &&
        coverage.total > 0 &&
        coverage.covered === coverage.total;
      const isPartiallyCovered =
        highlightedFiles != null &&
        coverage != null &&
        coverage.covered > 0 &&
        coverage.covered < coverage.total;
      const isDimmed =
        highlightedFiles != null && (coverage?.covered ?? 0) === 0;

      return (
        <Folder
          key={node.id}
          value={node.id}
          element={node.name}
          style={tintIcon ? visibilityVar(node.visibility!) : undefined}
          className={cn(
            isConfigured && 'font-semibold',
            // Layers read sky — the one structural accent. Modules and plain
            // grouping folders share the same neutral text; a folder is marked
            // as a module by its tinted ICON (visibility tier), not by dimming.
            isLayer && 'text-sky-600 dark:text-sky-400',
            (isModule || isIntermediate) && 'text-foreground/80',
            tintIcon && VISIBILITY_ICON,
            // A fully-covered folder mirrors the owned-file fill; a partial one
            // gets a fainter wash so the boundary is still legible.
            isFullyCovered && 'rounded-md bg-primary/10 text-primary',
            isPartiallyCovered && 'rounded-md bg-primary/5',
            // Ignored entries, and branches outside the active highlight, dim.
            (node.status === 'ignored' || isDimmed) && 'opacity-40',
            isHoveredModuleFolder &&
              'rounded-md text-primary ring-1 ring-primary/40',
          )}
        >
          {node.children
            ? renderNodes({
                nodes: node.children,
                highlightedFiles,
                ownedFiles,
                consumedFiles,
                coverageGapFiles,
                configuredPaths,
                sortOrder,
                hoveredGraphFiles,
                hoveredModulePath,
                folderCoverage,
                showVisibility,
              })
            : null}
        </Folder>
      );
    }

    // Owned wins over consumed if a file somehow appears in both tiers.
    const isOwned = ownedFiles?.has(node.id) ?? false;
    const isConsumed = !isOwned && (consumedFiles?.has(node.id) ?? false);
    const isGap = coverageGapFiles.has(node.id);
    const isGraphHovered = hoveredGraphFiles?.has(node.id);
    // A file outside the active highlight dims, matching its folder ancestors.
    const isDimmed = highlightedFiles != null && !highlightedFiles.has(node.id);
    // A single-file module tints its status icon by visibility (Features tab),
    // mirroring module folders. The icon SHAPE still reads as coverage status.
    const tintIcon =
      showVisibility && node.nodeKind === 'module' && node.visibility != null;

    return (
      <File
        key={node.id}
        value={node.id}
        fileIcon={<StatusIcon status={node.status} />}
        style={tintIcon ? visibilityVar(node.visibility!) : undefined}
        className={cn(
          isOwned && 'rounded-md bg-primary/10 text-primary',
          isConsumed &&
            'rounded-md bg-sky-500/5 text-sky-700 underline decoration-sky-500/50 decoration-dashed underline-offset-2 dark:text-sky-300',
          // Ignored files, and files outside the active highlight, dim.
          (node.status === 'ignored' || isDimmed) && 'opacity-40',
          tintIcon && VISIBILITY_ICON,
          isGraphHovered && 'rounded-md bg-primary/20 ring-1 ring-primary/30',
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{node.name}</span>
        {!highlightedFiles && isGap ? (
          <span title="not in any module" className="shrink-0">
            <XIcon
              aria-label="not in any module"
              className="size-3 text-muted-foreground/50"
            />
          </span>
        ) : null}
      </File>
    );
  });
}

export type TreeFilterOptions = {
  /** Hide intermediate (non-layer, non-module) folders and all files. */
  hideNonModules: boolean;
  /** Hide files with an `ignored` status. */
  hideIgnored: boolean;
  /**
   * When set, show ONLY files with this coverage status (plus the folders that
   * lead to them). Takes precedence over the toggles above — it's a focused
   * "show me just the present / not-covered / ignored files" view.
   */
  statusFilter?: FileStatus | null;
  /**
   * When set, show ONLY the highlighted files (plus the folders leading to
   * them). Used to focus the tree on the currently selected feature/module/
   * layer, hiding everything that isn't part of the highlight.
   */
  highlightFilter?: Set<string> | null;
  modulePaths: Set<string>;
  layerPaths: Set<string>;
};

/** Collect every folder id in a tree — used to fully expand a filtered view. */
export function collectAllFolderIds(nodes: FileTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.type === 'folder') {
      ids.push(node.id);
      if (node.children) ids.push(...collectAllFolderIds(node.children));
    }
  }
  return ids;
}

/** Keep only files matching `status` and the ancestor folders leading to them. */
function filterByStatus(
  nodes: FileTreeNode[],
  status: FileStatus,
): FileTreeNode[] {
  const result: FileTreeNode[] = [];
  for (const node of nodes) {
    if (node.type === 'file') {
      if (node.status === status) result.push(node);
      continue;
    }
    const children = node.children
      ? filterByStatus(node.children, status)
      : undefined;
    if ((children?.length ?? 0) > 0) result.push({ ...node, children });
  }
  return result;
}

/** Keep only files in `highlighted` and the ancestor folders leading to them. */
function filterByHighlight(
  nodes: FileTreeNode[],
  highlighted: Set<string>,
): FileTreeNode[] {
  const result: FileTreeNode[] = [];
  for (const node of nodes) {
    if (node.type === 'file') {
      if (highlighted.has(node.id)) result.push(node);
      continue;
    }
    const children = node.children
      ? filterByHighlight(node.children, highlighted)
      : undefined;
    if ((children?.length ?? 0) > 0) result.push({ ...node, children });
  }
  return result;
}

/**
 * Apply session-scoped view filters to a copy of the tree. Returns a new node
 * array; the underlying model is never mutated. Filtering is feature- and
 * expansion-independent — pruned ids simply no longer appear.
 *
 * - `hideIgnored`: drops file nodes whose status is `ignored`.
 * - `hideNonModules`: keeps only layer folders, module folders, and the
 *   ancestor folders needed to reach a module; drops intermediate folders with
 *   no module descendant and all individual files.
 */
export function filterTree(
  nodes: FileTreeNode[],
  options: TreeFilterOptions,
): FileTreeNode[] {
  if (options.highlightFilter)
    return filterByHighlight(nodes, options.highlightFilter);
  if (options.statusFilter) return filterByStatus(nodes, options.statusFilter);

  const result: FileTreeNode[] = [];
  for (const node of nodes) {
    if (node.type === 'file') {
      if (options.hideIgnored && node.status === 'ignored') continue;
      if (options.hideNonModules) continue;
      result.push(node);
      continue;
    }

    const children = node.children
      ? filterTree(node.children, options)
      : undefined;

    if (options.hideNonModules) {
      const isLayer = options.layerPaths.has(node.id);
      const isModule = options.modulePaths.has(node.id);
      const hasKeptChild = (children?.length ?? 0) > 0;
      // Keep modules (collapsed, no need for kept children), layers and any
      // ancestor that still leads to a kept module folder.
      if (!isModule && !isLayer && !hasKeptChild) continue;
    }

    result.push({ ...node, children });
  }
  return result;
}
