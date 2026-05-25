import type { VizSummary } from '../types';
import type { FileStatus, FileTreeNode } from './file-tree-types';

export function buildFileTree(summary: VizSummary): FileTreeNode[] {
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
  for (const v of summary.featureGraphViolations ?? []) {
    violationFiles.add(v.fromFile);
    if (v.kind === 'feature-cycle') violationFiles.add(v.toFile);
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

export function filterTree(
  nodes: FileTreeNode[],
  allowedFiles: Set<string>,
): FileTreeNode[] {
  return nodes.reduce<FileTreeNode[]>((acc, node) => {
    if (node.type === 'file') {
      if (allowedFiles.has(node.id)) acc.push(node);
    } else if (node.children) {
      const filteredChildren = filterTree(node.children, allowedFiles);
      if (filteredChildren.length > 0) {
        acc.push({ ...node, children: filteredChildren });
      }
    }
    return acc;
  }, []);
}

/**
 * Expand only up to configured path depth — not beyond.
 */
export function collectExpandedIds(configuredPaths: string[]): string[] {
  const ids = new Set<string>();
  for (const p of configuredPaths) {
    const segments = p.split('/');
    for (let i = 1; i < segments.length; i++) {
      ids.add(segments.slice(0, i).join('/'));
    }
  }
  return [...ids];
}

const FEATURE_AUTO_EXPAND_FILE_LIMIT = 6;

export function collectFeatureExpandedIds(nodes: FileTreeNode[]): string[] {
  const ids = new Set<string>();

  for (const node of nodes) {
    collectFeatureExpandedFolderIds(node, 0, ids);
  }

  return [...ids];
}

function collectFeatureExpandedFolderIds(
  node: FileTreeNode,
  depth: number,
  ids: Set<string>,
): void {
  if (node.type !== 'folder') return;

  const shouldExpand =
    depth === 0 ||
    (depth === 1 && countFiles(node) <= FEATURE_AUTO_EXPAND_FILE_LIMIT);

  if (shouldExpand) ids.add(node.id);
  if (depth >= 1) return;

  for (const child of node.children ?? []) {
    collectFeatureExpandedFolderIds(child, depth + 1, ids);
  }
}

function countFiles(node: FileTreeNode): number {
  if (node.type === 'file') return 1;
  return (node.children ?? []).reduce(
    (sum, child) => sum + countFiles(child),
    0,
  );
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
