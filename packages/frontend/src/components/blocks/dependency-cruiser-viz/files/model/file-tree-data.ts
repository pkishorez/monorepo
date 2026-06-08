import type { VizSummary } from '../../model';
import type { FileStatus, FileTreeNode } from './file-tree-types';

export function buildFileTree(
  summary: VizSummary,
  layerPaths: Set<string>,
  modulePaths: Set<string>,
): FileTreeNode[] {
  const fileStatuses = new Map<string, FileStatus>();

  for (const { files } of summary.coveredFiles) {
    for (const f of files) {
      fileStatuses.set(f, 'covered');
    }
  }

  for (const f of summary.ignoredFiles) {
    fileStatuses.set(f, 'ignored');
  }

  for (const f of summary.layerOrphanFiles) {
    fileStatuses.set(f, 'orphan');
  }

  const violationFiles = new Set<string>();
  for (const v of summary.violations) {
    violationFiles.add(v.fromFile);
    violationFiles.add(v.toFile);
  }
  for (const f of violationFiles) {
    fileStatuses.set(f, 'violation');
  }

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
          nodeKind: isFile
            ? 'other'
            : layerPaths.has(id)
              ? 'layer'
              : modulePaths.has(id)
                ? 'module'
                : 'other',
          children: isFile ? undefined : [],
        };
        current.push(existing);
      }

      if (!isFile) {
        current = existing.children!;
      }
    }
  }

  propagateFolderStatus(root);
  return root;
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
  if (statuses.has('violation')) return 'violation';
  if (statuses.has('orphan')) return 'orphan';
  if (statuses.has('covered')) return 'covered';
  if (statuses.has('ignored')) return 'ignored';
  return undefined;
}
