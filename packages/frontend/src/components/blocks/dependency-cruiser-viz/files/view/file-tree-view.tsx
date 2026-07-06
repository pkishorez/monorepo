import { XIcon } from 'lucide-react';
import {
  File,
  Folder,
  Tree,
  type TreeViewElement,
} from '#components/ui/file-tree';
import { cn } from '#lib/utils';
import type { ReactNode } from 'react';

import type { FileStatus, FileTreeNode } from '../model/file-tree-model';
import { StatusIcon } from './status-icon';

/**
 * The file tree uses exactly two accent colors: sky for layer boundaries and
 * amber for declared modules (folders and single-file modules alike). To keep
 * it quiet, the module accent colors only the *icon* while a layer colors the
 * *text* — so a folder that is both a layer and a module reads as an amber icon
 * with sky text. Roles (root/leaf/dead) are a canvas concern, absent here.
 */
const MODULE_ACCENT = 'text-amber-600 dark:text-amber-400';
const LAYER_ACCENT = 'text-sky-600 dark:text-sky-400';

/** Secondary (highlighted-module) emphasis — amber, vs the primary fill of the
 * selected module — so both can show at once and stay distinguishable. */
const SECONDARY_FILL = 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
const SECONDARY_FILL_FAINT = 'bg-amber-500/5';

type FileTreeViewProps = {
  tree: FileTreeNode[];
  treeKey: string;
  expandedItems: string[];
  /** Identity of the expansion intent; re-applies expandedItems when it changes. */
  expansionSignal: string;
  /** True while expandedItems is a transient focus to snap to (and revert from). */
  expansionFocused: boolean;
  /** Drives containment and dimming (union of every active emphasis). */
  highlightedFiles: Set<string> | null;
  /** Files of the selected module (or layer) — strong primary emphasis. */
  ownedFiles: Set<string> | null;
  /** Files of the highlighted module — secondary (amber) emphasis. */
  highlightedModuleFiles: Set<string> | null;
  /** Coverage-gap files: in a layer but no declared module. */
  coverageGapFiles: Set<string>;
  configuredPaths: Set<string>;
  /** Declared module folder/file ids — get the amber icon accent. */
  modulePaths: Set<string>;
  /** Rules configured per module path — shown as a count beside the row. */
  ruleCountByPath: Map<string, number>;
  /** Declared layer folder ids — get the sky text accent. */
  layerPaths: Set<string>;
  sortOrder: Map<string, number>;
  hoveredGraphFiles: Set<string> | null;
  /** Full folder path of the canvas-hovered module, for transient highlight. */
  hoveredModulePath: string | null;
};

export function FileTreeView({
  tree,
  treeKey,
  expandedItems,
  expansionSignal,
  expansionFocused,
  highlightedFiles,
  ownedFiles,
  highlightedModuleFiles,
  coverageGapFiles,
  configuredPaths,
  modulePaths,
  ruleCountByPath,
  layerPaths,
  sortOrder,
  hoveredGraphFiles,
  hoveredModulePath,
}: FileTreeViewProps) {
  // Coverage of each folder's leaf files against the active emphasis sets, used
  // to dim untouched branches and to mark folders as fully / partially covered.
  const folderCoverage = new Map<string, FolderCoverage>();
  computeFolderCoverage(
    tree,
    highlightedFiles,
    ownedFiles,
    highlightedModuleFiles,
    folderCoverage,
  );

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
        highlightedModuleFiles,
        coverageGapFiles,
        configuredPaths,
        modulePaths,
        ruleCountByPath,
        layerPaths,
        sortOrder,
        hoveredGraphFiles,
        hoveredModulePath,
        folderCoverage,
      })}
    </Tree>
  );
}

/** Covered vs total leaf-file counts for a folder's subtree, per emphasis set. */
type FolderCoverage = {
  covered: number;
  owned: number;
  secondary: number;
  total: number;
};

/**
 * Walk the tree once, recording for each folder how many of its leaf files fall
 * within each emphasis set. Folders with zero covered leaves are dimmed;
 * folders whose every leaf is covered get that set's full-row emphasis.
 */
function computeFolderCoverage(
  nodes: FileTreeNode[],
  highlightedFiles: Set<string> | null,
  ownedFiles: Set<string> | null,
  highlightedModuleFiles: Set<string> | null,
  out: Map<string, FolderCoverage>,
): FolderCoverage {
  const sum: FolderCoverage = { covered: 0, owned: 0, secondary: 0, total: 0 };
  for (const node of nodes) {
    if (node.type === 'file') {
      sum.total += 1;
      if (highlightedFiles?.has(node.id)) sum.covered += 1;
      if (ownedFiles?.has(node.id)) sum.owned += 1;
      if (highlightedModuleFiles?.has(node.id)) sum.secondary += 1;
      continue;
    }
    const child = computeFolderCoverage(
      node.children ?? [],
      highlightedFiles,
      ownedFiles,
      highlightedModuleFiles,
      out,
    );
    out.set(node.id, child);
    sum.covered += child.covered;
    sum.owned += child.owned;
    sum.secondary += child.secondary;
    sum.total += child.total;
  }
  return sum;
}

function renderNodes({
  nodes,
  highlightedFiles,
  ownedFiles,
  highlightedModuleFiles,
  coverageGapFiles,
  configuredPaths,
  modulePaths,
  ruleCountByPath,
  layerPaths,
  sortOrder,
  hoveredGraphFiles,
  hoveredModulePath,
  folderCoverage,
}: {
  nodes: FileTreeNode[];
  highlightedFiles: Set<string> | null;
  ownedFiles: Set<string> | null;
  highlightedModuleFiles: Set<string> | null;
  coverageGapFiles: Set<string>;
  configuredPaths: Set<string>;
  modulePaths: Set<string>;
  ruleCountByPath: Map<string, number>;
  layerPaths: Set<string>;
  sortOrder: Map<string, number>;
  hoveredGraphFiles: Set<string> | null;
  hoveredModulePath: string | null;
  folderCoverage: Map<string, FolderCoverage>;
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
      // Detected independently: a folder can be BOTH a layer and a module.
      const isLayer = layerPaths.has(node.id);
      const isModule = modulePaths.has(node.id);
      const isHoveredModuleFolder =
        hoveredModulePath != null && node.id === hoveredModulePath;

      // While an emphasis is active, fold the folder's leaf coverage into the
      // row: a folder fully covered by the selected module carries the primary
      // fill, one fully covered by the highlighted module the amber fill,
      // partially-covered ones a subtler tint, and untouched branches dim.
      const coverage = folderCoverage.get(node.id);
      const hasEmphasis = highlightedFiles != null;
      const isFullyOwned =
        hasEmphasis &&
        coverage != null &&
        coverage.total > 0 &&
        coverage.owned === coverage.total;
      const isFullySecondary =
        hasEmphasis &&
        !isFullyOwned &&
        coverage != null &&
        coverage.total > 0 &&
        coverage.secondary === coverage.total;
      const isPartiallyCovered =
        hasEmphasis &&
        !isFullyOwned &&
        !isFullySecondary &&
        coverage != null &&
        coverage.covered > 0 &&
        coverage.covered < coverage.total;
      const isDimmed = hasEmphasis && (coverage?.covered ?? 0) === 0;
      const partialLeansSecondary =
        isPartiallyCovered &&
        coverage != null &&
        coverage.secondary >= coverage.owned;

      return (
        <Folder
          key={node.id}
          value={node.id}
          element={node.name}
          // A module tints only its icon (quiet); a layer tints its text. Both
          // at once → amber icon + sky text. Neither → full-strength default.
          iconClassName={isModule ? MODULE_ACCENT : undefined}
          suffix={<RuleCountBadge count={ruleCountByPath.get(node.id)} />}
          className={cn(
            isConfigured && 'font-semibold',
            isLayer && LAYER_ACCENT,
            // A fully-covered folder mirrors its set's file fill; a partial one
            // gets a fainter wash so the boundary is still legible.
            isFullyOwned && 'rounded-md bg-primary/10 text-primary',
            isFullySecondary && cn('rounded-md', SECONDARY_FILL),
            isPartiallyCovered &&
              cn(
                'rounded-md',
                partialLeansSecondary ? SECONDARY_FILL_FAINT : 'bg-primary/5',
              ),
            // Ignored entries, and branches outside the active emphasis, dim.
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
                highlightedModuleFiles,
                coverageGapFiles,
                configuredPaths,
                modulePaths,
                ruleCountByPath,
                layerPaths,
                sortOrder,
                hoveredGraphFiles,
                hoveredModulePath,
                folderCoverage,
              })
            : null}
        </Folder>
      );
    }

    const isMember = ownedFiles?.has(node.id) ?? false;
    const isSecondary =
      !isMember && (highlightedModuleFiles?.has(node.id) ?? false);
    const isGap = coverageGapFiles.has(node.id);
    const isGraphHovered = hoveredGraphFiles?.has(node.id);
    // A single-file module tints only its icon amber, matching module folders.
    const isModuleFile = modulePaths.has(node.id);
    // A file outside the active emphasis dims, matching its folder ancestors.
    const isDimmed = highlightedFiles != null && !highlightedFiles.has(node.id);

    return (
      <File
        key={node.id}
        value={node.id}
        fileIcon={
          <StatusIcon
            status={node.status}
            accentClassName={isModuleFile ? MODULE_ACCENT : undefined}
          />
        }
        className={cn(
          isMember && 'rounded-md bg-primary/10 text-primary',
          isSecondary && cn('rounded-md', SECONDARY_FILL),
          // Ignored files, and files outside the active emphasis, dim.
          (node.status === 'ignored' || isDimmed) && 'opacity-40',
          isGraphHovered && 'rounded-md bg-primary/20 ring-1 ring-primary/30',
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{node.name}</span>
        <RuleCountBadge count={ruleCountByPath.get(node.id)} />
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

/** Count of rules configured on a declared module, beside its row. */
function RuleCountBadge({ count }: { count: number | undefined }) {
  if (!count) return null;
  return (
    <span
      title={`${count} rule${count === 1 ? '' : 's'} configured`}
      className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full border border-border bg-muted px-1 text-[9px] font-semibold tabular-nums text-muted-foreground"
    >
      {count}
    </span>
  );
}

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
export function filterByStatus(
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
