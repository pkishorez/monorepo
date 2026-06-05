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
 * Expand folders down to — but not into — the module level, so the tree opens
 * collapsed at modules with their files hidden until the user drills in.
 *
 * Only the path leading to a module is auto-opened: a module folder itself is
 * left collapsed (visible, contents hidden), and a non-module folder that has
 * no module descendant is also left collapsed. Ancestors of modules expand.
 */
export function collectModuleCollapsedIds(
  nodes: FileTreeNode[],
  modulePaths: Set<string>,
): string[] {
  const ids = new Set<string>();
  for (const node of nodes) {
    collectModuleAncestorIds(node, modulePaths, ids);
  }
  return [...ids];
}

/**
 * Returns true if `node` is, or contains, a declared module. As a side effect,
 * adds every folder that leads to a deeper module to `ids` (so only the
 * DEEPEST module — one with no module descendant — renders collapsed).
 */
function collectModuleAncestorIds(
  node: FileTreeNode,
  modulePaths: Set<string>,
  ids: Set<string>,
): boolean {
  if (node.type !== 'folder') return false;

  const isModule = modulePaths.has(node.id);
  let hasModuleDescendant = false;
  for (const child of node.children ?? []) {
    if (collectModuleAncestorIds(child, modulePaths, ids)) {
      hasModuleDescendant = true;
    }
  }

  // Expand any folder that contains a deeper declared module — even one that is
  // itself a module — so a nested module stays reachable. Only the deepest
  // module (no module descendant) is left collapsed.
  if (hasModuleDescendant) ids.add(node.id);

  return isModule || hasModuleDescendant;
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
