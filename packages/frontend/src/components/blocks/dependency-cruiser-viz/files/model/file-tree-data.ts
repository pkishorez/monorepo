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
 * Expansion ids for opening the tree collapsed at the second level: only the
 * outermost folder(s) are expanded, so their immediate children render visible
 * but collapsed. Given `src/a/…` and `src/b/…`, `src` opens while `a` and `b`
 * stay closed until the user drills in.
 */
export function collectTopLevelExpandedIds(nodes: FileTreeNode[]): string[] {
  return nodes.filter((node) => node.type === 'folder').map((node) => node.id);
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
