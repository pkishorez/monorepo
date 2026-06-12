import { XIcon } from 'lucide-react';
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
  /** Full module path -> declared visibility tier, for module folder dots. */
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

/** A small colored marker dot appended to a row, mirroring the graph chips. */
function MarkerDot({ color, label }: { color: string; label?: string }) {
  return (
    <span
      aria-hidden={label ? undefined : true}
      title={label}
      className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

function renderNodes({
  nodes,
  highlightedFiles,
  ownedFiles,
  consumedFiles,
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
      // Module folders carry their visibility tier as a dot (violet fallback
      // when no declared tier is found), matching the graph's chip dots.
      const moduleTier = isModule
        ? (moduleVisibility.get(node.id) ?? 'private')
        : undefined;
      const hasViolation = isIntermediate && node.status === 'violation';

      return (
        <Folder
          key={node.id}
          value={node.id}
          element={node.name}
          suffix={
            moduleTier ? (
              <MarkerDot
                color={VISIBILITY_COLOR[moduleTier]}
                label={moduleTier}
              />
            ) : hasViolation ? (
              <MarkerDot color="hsl(0 84% 60%)" label="contains violations" />
            ) : undefined
          }
          className={cn(
            isConfigured && 'font-semibold',
            // Layers read sky — the one structural accent; modules and plain
            // folders stay neutral, with tier carried by the suffix dot.
            isLayer && 'text-sky-600 dark:text-sky-400',
            isModule && 'text-foreground/80',
            isIntermediate && 'text-muted-foreground/70',
            node.status === 'ignored' && 'opacity-40',
            folderDimmed && 'opacity-35',
            folderHoverDimmed && 'opacity-35',
            isHoveredModuleFolder &&
              'rounded-md bg-primary/15 text-primary ring-1 ring-primary/30',
          )}
        >
          {node.children
            ? renderNodes({
                nodes: node.children,
                highlightedFiles,
                ownedFiles,
                consumedFiles,
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

    return (
      <File
        key={node.id}
        value={node.id}
        fileIcon={<StatusIcon status={node.status} />}
        className={cn(
          isOwned && 'rounded-md bg-primary/10 text-primary',
          isConsumed &&
            'rounded-md bg-sky-500/5 text-sky-700 underline decoration-sky-500/50 decoration-dashed underline-offset-2 dark:text-sky-300',
          !highlightedFiles && node.status === 'ignored' && 'opacity-40',
          isDimmed && 'opacity-35',
          isGraphHovered && 'rounded-md bg-primary/20 ring-1 ring-primary/30',
          isGraphDimmed && 'opacity-35',
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
