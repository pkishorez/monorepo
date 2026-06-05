import {
  File,
  Folder,
  Tree,
  type TreeViewElement,
} from '#components/ui/file-tree';
import { cn } from '#lib/utils';
import type { ReactNode } from 'react';

import { VISIBILITY_COLOR, type Visibility } from '../../model';
import type { FileTreeNode } from '../model/file-tree-model';
import { StatusIcon } from './status-icon';

type FileTreeViewProps = {
  tree: FileTreeNode[];
  treeKey: string;
  expandedItems: string[];
  /** Union of owned ∪ consumed — drives containment and dimming. */
  highlightedFiles: Set<string> | null;
  /** Files the feature/layer OWNS — strong primary highlight. */
  ownedFiles: Set<string> | null;
  /** Files the feature CONSUMES (borrows) — subtle highlight + marker. */
  consumedFiles: Set<string> | null;
  /**
   * When true (a feature is selected), highlighted rows are colored by the
   * visibility tier of their owning module instead of the owned/consumed
   * primary scheme. Owned/consumed stays as an orthogonal "borrowed" marker.
   */
  colorByTier: boolean;
  /** File path -> visibility tier of its owning module. */
  fileVisibility: Map<string, Visibility>;
  /** Full module path -> declared visibility tier, for module folder colors. */
  moduleVisibility: Map<string, Visibility>;
  /** Coverage-gap files: in a layer but no declared module. */
  coverageGapFiles: Set<string>;
  configuredPaths: Set<string>;
  sortOrder: Map<string, number>;
  hoveredGraphFiles: Set<string> | null;
  /** Full folder path of the canvas-hovered module, for transient highlight. */
  hoveredModulePath: string | null;
};

export function FileTreeView({
  tree,
  treeKey,
  expandedItems,
  highlightedFiles,
  ownedFiles,
  consumedFiles,
  colorByTier,
  fileVisibility,
  moduleVisibility,
  coverageGapFiles,
  configuredPaths,
  sortOrder,
  hoveredGraphFiles,
  hoveredModulePath,
}: FileTreeViewProps) {
  return (
    <Tree
      key={treeKey}
      elements={tree as TreeViewElement[]}
      initialExpandedItems={expandedItems}
    >
      {renderNodes({
        nodes: tree,
        highlightedFiles,
        ownedFiles,
        consumedFiles,
        colorByTier,
        fileVisibility,
        moduleVisibility,
        coverageGapFiles,
        configuredPaths,
        sortOrder,
        hoveredGraphFiles,
        hoveredModulePath,
      })}
    </Tree>
  );
}

function renderNodes({
  nodes,
  highlightedFiles,
  ownedFiles,
  consumedFiles,
  colorByTier,
  fileVisibility,
  moduleVisibility,
  coverageGapFiles,
  configuredPaths,
  sortOrder,
  hoveredGraphFiles,
  hoveredModulePath,
}: {
  nodes: FileTreeNode[];
  highlightedFiles: Set<string> | null;
  ownedFiles: Set<string> | null;
  consumedFiles: Set<string> | null;
  colorByTier: boolean;
  fileVisibility: Map<string, Visibility>;
  moduleVisibility: Map<string, Visibility>;
  coverageGapFiles: Set<string>;
  configuredPaths: Set<string>;
  sortOrder: Map<string, number>;
  hoveredGraphFiles: Set<string> | null;
  hoveredModulePath: string | null;
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
      // When a feature is active, dim folders that contain no active file.
      const folderDimmed =
        highlightedFiles && !folderContainsAny(node, highlightedFiles);
      const folderHasGap = folderContainsAny(node, coverageGapFiles);
      const isConfigured = configuredPaths.has(node.id);
      const isLayer = node.nodeKind === 'layer';
      const isModule = node.nodeKind === 'module';
      // An intermediate folder is any non-module, non-layer grouping folder.
      const isIntermediate = !isLayer && !isModule;
      const isOnHoverPath =
        hoveredModulePath != null &&
        (node.id === hoveredModulePath ||
          isInside(node.id, hoveredModulePath) ||
          isInside(hoveredModulePath, node.id));
      const folderHoverDimmed = hoveredModulePath != null && !isOnHoverPath;
      const isHoveredModuleFolder =
        hoveredModulePath != null && node.id === hoveredModulePath;
      // Module folders are colored by their visibility tier at all times
      // (green=public, yellow=shared, gray=private). Tier is a raw hsl string,
      // applied inline. Fall back to violet if the path isn't in the map.
      const moduleTierColor = isModule
        ? moduleVisibility.has(node.id)
          ? VISIBILITY_COLOR[moduleVisibility.get(node.id)!]
          : undefined
        : undefined;

      return (
        <Folder
          key={node.id}
          value={node.id}
          element={node.name}
          style={moduleTierColor ? { color: moduleTierColor } : undefined}
          className={cn(
            isConfigured && 'font-semibold',
            // Layers read sky; module folders are tier-colored inline above
            // (with a violet fallback when no declared tier is found). Feature
            // de-emphasis is applied via opacity alone (see folderDimmed below).
            isLayer && 'text-sky-500',
            isModule && !moduleTierColor && 'text-violet-500',
            // Intermediate (non-module) grouping folders read in a muted tone
            // so the eye distinguishes module boundaries from plain folders.
            isIntermediate &&
              node.status !== 'violation' &&
              !folderHasGap &&
              'text-muted-foreground/70',
            isIntermediate && node.status === 'violation' && 'text-red-500',
            isIntermediate && folderHasGap && 'text-muted-foreground',
            node.status === 'ignored' && 'opacity-40',
            folderDimmed && 'opacity-[0.12]',
            folderHoverDimmed && 'opacity-20',
            isHoveredModuleFolder &&
              'rounded-md bg-primary/15 font-semibold text-primary ring-1 ring-primary/30',
          )}
        >
          {node.children
            ? renderNodes({
                nodes: node.children,
                highlightedFiles,
                ownedFiles,
                consumedFiles,
                colorByTier,
                fileVisibility,
                moduleVisibility,
                coverageGapFiles,
                configuredPaths,
                sortOrder,
                hoveredGraphFiles,
                hoveredModulePath,
              })
            : null}
        </Folder>
      );
    }

    const isHighlighted = highlightedFiles?.has(node.id);
    // Owned wins over consumed if a file somehow appears in both tiers.
    const isOwned = ownedFiles?.has(node.id) ?? false;
    const isConsumed = !isOwned && (consumedFiles?.has(node.id) ?? false);
    const isDimmed = highlightedFiles && !isHighlighted;
    const isGap = coverageGapFiles.has(node.id);
    const isGraphHovered = hoveredGraphFiles?.has(node.id);
    const isGraphDimmed = hoveredModulePath != null && !isGraphHovered;

    // Feature/module context: the row is colored by the module's VISIBILITY
    // TIER (green=public, yellow=shared, gray=private) — text only, no box/ring
    // (a ring/background reads like a selection). The "BORROWED" badge on a
    // consumed file stays as an orthogonal marker. Layer/coverage context
    // (colorByTier=false) is unchanged.
    const tier =
      colorByTier && isHighlighted ? fileVisibility.get(node.id) : undefined;
    const tierColor = tier ? VISIBILITY_COLOR[tier] : undefined;

    return (
      <File
        key={node.id}
        value={node.id}
        fileIcon={<StatusIcon status={node.status} />}
        style={tierColor ? { color: tierColor } : undefined}
        className={cn(
          tierColor && 'font-medium',
          // Owned without tier (layer context): strong primary fill.
          !colorByTier &&
            isOwned &&
            'rounded-md bg-primary/10 font-medium text-primary',
          // Consumed without tier (layer context): cooler sky tint + marker.
          !colorByTier &&
            isConsumed &&
            'rounded-md bg-sky-500/5 text-sky-700 underline decoration-sky-500/50 decoration-dashed underline-offset-2 dark:text-sky-300',
          !highlightedFiles &&
            isGap &&
            'text-muted-foreground decoration-dotted underline-offset-2',
          !highlightedFiles && node.status === 'ignored' && 'opacity-40',
          isDimmed && 'opacity-[0.12]',
          isGraphHovered &&
            'rounded-md bg-primary/20 font-semibold ring-1 ring-primary/30',
          isGraphDimmed && 'opacity-20',
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{node.name}</span>
        {isConsumed ? (
          <span className="shrink-0 rounded-sm border border-border bg-muted/60 px-1 py-0.5 text-[10px] leading-none font-medium uppercase opacity-80">
            borrowed
          </span>
        ) : null}
        {!highlightedFiles && isGap ? (
          <span className="shrink-0 rounded-sm border border-border bg-muted px-1 py-0.5 text-[10px] leading-none font-medium text-muted-foreground uppercase">
            no module
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
  modulePaths: Set<string>;
  layerPaths: Set<string>;
};

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

/** True if `id` is a descendant path of `ancestor` (or equal handled by caller). */
function isInside(id: string, ancestor: string): boolean {
  return id.startsWith(`${ancestor}/`);
}

function folderContainsAny(
  node: FileTreeNode,
  fileSet: Set<string> | null,
): boolean {
  if (!fileSet) return false;
  if (node.type === 'file') return fileSet.has(node.id);
  return (
    node.children?.some((child) => folderContainsAny(child, fileSet)) ?? false
  );
}
