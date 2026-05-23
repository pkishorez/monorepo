import type { TreeViewElement } from '#components/ui/file-tree';

import type { VizSummary } from './types';

export type FileStatus = 'covered' | 'violation' | 'orphan' | 'ignored';

export type FileTreeNode = TreeViewElement & {
  status?: FileStatus;
  children?: FileTreeNode[];
};

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

  for (const f of summary.orphanFiles) {
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
