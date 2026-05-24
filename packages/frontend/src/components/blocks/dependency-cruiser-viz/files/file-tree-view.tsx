import {
  File,
  Folder,
  Tree,
  type TreeViewElement,
} from '#components/ui/file-tree';
import { cn } from '#lib/utils';
import type { ReactNode } from 'react';

import type { FileStatus, FileTreeNode } from './file-tree-model';
import { StatusIcon } from './status-icon';

type FileTreeViewProps = {
  tree: FileTreeNode[];
  treeKey: string;
  expandedItems: string[];
  highlightedFiles: Set<string> | null;
  configuredPaths: Set<string>;
  sortOrder: Map<string, number>;
  statusOverrides: Map<string, FileStatus> | null;
};

export function FileTreeView({
  tree,
  treeKey,
  expandedItems,
  highlightedFiles,
  configuredPaths,
  sortOrder,
  statusOverrides,
}: FileTreeViewProps) {
  return (
    <Tree
      key={treeKey}
      elements={tree as TreeViewElement[]}
      initialExpandedItems={expandedItems}
    >
      {renderFileTreeNodes({
        nodes: tree,
        highlightedFiles,
        configuredPaths,
        sortOrder,
        statusOverrides,
      })}
    </Tree>
  );
}

function renderFileTreeNodes({
  nodes,
  highlightedFiles,
  configuredPaths,
  sortOrder,
  statusOverrides,
}: {
  nodes: FileTreeNode[];
  highlightedFiles: Set<string> | null;
  configuredPaths: Set<string>;
  sortOrder: Map<string, number>;
  statusOverrides: Map<string, FileStatus> | null;
}): ReactNode {
  const sorted = [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    const orderA = sortOrder.get(a.id);
    const orderB = sortOrder.get(b.id);
    if (orderA != null && orderB != null) return orderA - orderB;
    if (orderA != null) return -1;
    if (orderB != null) return 1;
    return a.name.localeCompare(b.name);
  });

  return sorted.map((node) => {
    const effectiveStatus = statusOverrides?.get(node.id) ?? node.status;

    if (node.type === 'folder') {
      const folderDimmed =
        highlightedFiles && !folderContainsHighlighted(node, highlightedFiles);
      const isConfigured = configuredPaths.has(node.id);
      const folderStatus =
        statusOverrides && node.children
          ? deriveFolderStatus(node.children, statusOverrides)
          : effectiveStatus;

      return (
        <Folder
          key={node.id}
          value={node.id}
          element={node.name}
          className={cn(
            isConfigured && 'font-semibold',
            !highlightedFiles && folderStatus === 'violation' && 'text-red-500',
            !highlightedFiles && folderStatus === 'orphan' && 'text-yellow-500',
            !highlightedFiles &&
              folderStatus === 'covered' &&
              'text-foreground',
            !highlightedFiles && folderStatus === 'ignored' && 'opacity-40',
            folderDimmed && 'opacity-30',
          )}
        >
          {node.children
            ? renderFileTreeNodes({
                nodes: node.children,
                highlightedFiles,
                configuredPaths,
                sortOrder,
                statusOverrides,
              })
            : null}
        </Folder>
      );
    }

    const isHighlighted = highlightedFiles?.has(node.id);
    const isDimmed = highlightedFiles && !isHighlighted;

    return (
      <File
        key={node.id}
        value={node.id}
        fileIcon={<StatusIcon status={effectiveStatus} />}
        className={cn(
          isHighlighted && 'rounded-md bg-primary/10 font-medium',
          !highlightedFiles &&
            effectiveStatus === 'covered' &&
            'text-foreground',
          !highlightedFiles && effectiveStatus === 'ignored' && 'opacity-40',
          isDimmed && 'opacity-30',
        )}
      >
        <span className="truncate">{node.name}</span>
      </File>
    );
  });
}

function folderContainsHighlighted(
  node: FileTreeNode,
  highlightedFiles: Set<string>,
): boolean {
  if (node.type === 'file') return highlightedFiles.has(node.id);
  return (
    node.children?.some((child) =>
      folderContainsHighlighted(child, highlightedFiles),
    ) ?? false
  );
}

function deriveFolderStatus(
  children: FileTreeNode[],
  overrides: Map<string, FileStatus>,
): FileStatus | undefined {
  const statuses = new Set<FileStatus>();
  for (const child of children) {
    if (child.type === 'folder' && child.children) {
      const s = deriveFolderStatus(child.children, overrides);
      if (s) statuses.add(s);
    } else {
      const s = overrides.get(child.id);
      if (s) statuses.add(s);
    }
  }
  if (statuses.has('violation')) return 'violation';
  if (statuses.has('orphan')) return 'orphan';
  if (statuses.has('covered')) return 'covered';
  if (statuses.has('ignored')) return 'ignored';
  return undefined;
}
