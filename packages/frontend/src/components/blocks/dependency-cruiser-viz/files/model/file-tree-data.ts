import type { VizSummary } from '../../model';
import type { FileStatus, FileTreeNode } from './file-tree-types';

/** Which coverage axis the tree classifies files against. */
export type CoverageMode = 'layers' | 'modules';

/**
 * Classify every scanned file as covered / orphan / ignored against the active
 * coverage axis:
 * - `layers`: covered = inside a declared layer; orphan = matches no layer.
 * - `modules`: covered = claimed by a declared module; orphan = everything else
 *   that isn't ignored (layer files in no module — the coverage gaps — plus files
 *   in no layer at all). This makes the Modules tab a true module-coverage tree.
 *
 * `ignored` always wins (ignored files never count toward either axis).
 */
export function computeFileStatuses(
  summary: VizSummary,
  mode: CoverageMode,
): Map<string, FileStatus> {
  const statuses = new Map<string, FileStatus>();

  if (mode === 'modules') {
    const moduleCovered = new Set<string>();
    for (const m of summary.moduleCoverage) {
      for (const f of m.files) moduleCovered.add(f);
    }
    for (const { files } of summary.coveredFiles) {
      for (const f of files) {
        statuses.set(f, moduleCovered.has(f) ? 'covered' : 'orphan');
      }
    }
  } else {
    for (const { files } of summary.coveredFiles) {
      for (const f of files) statuses.set(f, 'covered');
    }
  }

  for (const f of summary.layerOrphanFiles) statuses.set(f, 'orphan');
  for (const f of summary.ignoredFiles) statuses.set(f, 'ignored');

  return statuses;
}

export function buildFileTree(
  fileStatuses: Map<string, FileStatus>,
  layerPaths: Set<string>,
  modulePaths: Set<string>,
): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const sorted = [...fileStatuses.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );

  for (const [filePath, status] of sorted) {
    const parts = filePath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isFile = i === parts.length - 1;
      const id = parts.slice(0, i + 1).join('/');

      let existing = current.find((n) => n.name === part);
      if (!existing) {
        existing = {
          id,
          name: part,
          type: isFile ? 'file' : 'folder',
          status: isFile ? status : undefined,
          // A node IS a module when its own path is declared — true for module
          // folders and single-file modules alike.
          nodeKind: layerPaths.has(id)
            ? 'layer'
            : modulePaths.has(id)
              ? 'module'
              : 'other',
          children: isFile ? undefined : [],
        };
        current.push(existing);
      }

      if (!isFile) {
        // A path may appear both as a leaf file and as a directory ancestor of
        // another path (the same string classified two ways upstream). The node
        // was first created as a file with no children; promote it to a folder
        // so traversal can descend instead of dereferencing `undefined`.
        if (!existing.children) {
          existing.type = 'folder';
          existing.children = [];
        }
        current = existing.children;
      }
    }
  }

  propagateFolderStatus(root);
  return root;
}

/**
 * Expansion ids for opening a single target one level deep: every ancestor
 * folder leading to `targetId` and the target itself. Descendant folders stay
 * collapsed, so selecting a module or layer reveals only its immediate children
 * — the user drills deeper manually. Everything outside this path stays closed.
 */
export function collectExpandedForTarget(
  nodes: FileTreeNode[],
  targetId: string,
): string[] {
  const ids = new Set<string>();
  for (const node of nodes) collectTargetIds(node, targetId, [], ids);
  return [...ids];
}

function collectTargetIds(
  node: FileTreeNode,
  targetId: string,
  ancestors: string[],
  ids: Set<string>,
): boolean {
  // The target may itself be a file — a module declared as a single file — in
  // which case only its ancestors are expanded (a leaf has nothing to open) so
  // the file and its highlight become visible.
  if (node.id === targetId) {
    for (const id of ancestors) ids.add(id);
    if (node.type === 'folder') ids.add(node.id);
    return true;
  }

  if (node.type !== 'folder') return false;

  const path = [...ancestors, node.id];
  for (const child of node.children ?? []) {
    if (collectTargetIds(child, targetId, path, ids)) return true;
  }
  return false;
}

/**
 * Expand folders down to — but not into — the layer/module boundary, so the
 * tree opens collapsed at each layer or module with its contents hidden until
 * the user drills in.
 *
 * Only the path leading to a boundary is auto-opened: a boundary folder (layer
 * or module) is left collapsed (visible, contents hidden) unless it contains a
 * deeper boundary, in which case it expands so the deeper one stays reachable.
 * A non-boundary folder with no boundary descendant is also left collapsed.
 */
export function collectModuleCollapsedIds(
  nodes: FileTreeNode[],
  layerPaths: Set<string>,
  modulePaths: Set<string>,
): string[] {
  const ids = new Set<string>();
  for (const node of nodes) {
    collectBoundaryAncestorIds(node, layerPaths, modulePaths, ids);
  }
  return [...ids];
}

/**
 * Returns true if `node` is, or contains, a declared layer or module. As a side
 * effect, adds every folder that leads to a deeper boundary to `ids` (so only
 * the DEEPEST boundary — one with no boundary descendant — renders collapsed).
 */
function collectBoundaryAncestorIds(
  node: FileTreeNode,
  layerPaths: Set<string>,
  modulePaths: Set<string>,
  ids: Set<string>,
): boolean {
  if (node.type !== 'folder') return false;

  const isBoundary = layerPaths.has(node.id) || modulePaths.has(node.id);
  let hasBoundaryDescendant = false;
  for (const child of node.children ?? []) {
    if (collectBoundaryAncestorIds(child, layerPaths, modulePaths, ids)) {
      hasBoundaryDescendant = true;
    }
  }

  // Expand any folder that contains a deeper boundary — even one that is itself
  // a layer or module — so the deeper boundary stays reachable. Only the
  // deepest boundary (no boundary descendant) is left collapsed.
  if (hasBoundaryDescendant) ids.add(node.id);

  return isBoundary || hasBoundaryDescendant;
}

function propagateFolderStatus(nodes: FileTreeNode[]): FileStatus | undefined {
  for (const node of nodes) {
    if (node.type === 'folder' && node.children) {
      const childStatus = propagateFolderStatus(node.children);
      if (!node.status) node.status = childStatus;
    }
  }

  const statuses = new Set(nodes.map((n) => n.status).filter(Boolean));
  if (statuses.has('orphan')) return 'orphan';
  if (statuses.has('covered')) return 'covered';
  if (statuses.has('ignored')) return 'ignored';
  return undefined;
}
