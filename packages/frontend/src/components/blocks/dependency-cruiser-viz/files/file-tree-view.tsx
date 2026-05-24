import {
  File,
  Folder,
  Tree,
  type TreeViewElement,
} from '#components/ui/file-tree';
import { cn } from '#lib/utils';
import type { ReactNode } from 'react';

import type { FileTreeNode } from './file-tree-model';
import { StatusIcon } from './status-icon';

type FileTreeViewProps = {
  tree: FileTreeNode[];
  treeKey: string;
  expandedItems: string[];
  highlightedFiles: Set<string> | null;
  uncoveredFiles: Set<string> | null;
  configuredPaths: Set<string>;
  sortOrder: Map<string, number>;
};

export function FileTreeView({
  tree,
  treeKey,
  expandedItems,
  highlightedFiles,
  uncoveredFiles,
  configuredPaths,
  sortOrder,
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
        uncoveredFiles,
        configuredPaths,
        sortOrder,
      })}
    </Tree>
  );
}

function renderNodes({
  nodes,
  highlightedFiles,
  uncoveredFiles,
  configuredPaths,
  sortOrder,
}: {
  nodes: FileTreeNode[];
  highlightedFiles: Set<string> | null;
  uncoveredFiles: Set<string> | null;
  configuredPaths: Set<string>;
  sortOrder: Map<string, number>;
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
      const folderDimmed =
        highlightedFiles &&
        !folderContainsAny(node, highlightedFiles) &&
        !folderContainsAny(node, uncoveredFiles);
      const folderUncovered =
        uncoveredFiles &&
        !folderContainsAny(node, highlightedFiles) &&
        folderContainsAny(node, uncoveredFiles);
      const isConfigured = configuredPaths.has(node.id);

      return (
        <Folder
          key={node.id}
          value={node.id}
          element={node.name}
          className={cn(
            isConfigured && 'font-semibold',
            !highlightedFiles && node.status === 'violation' && 'text-red-500',
            !highlightedFiles && node.status === 'orphan' && 'text-yellow-500',
            !highlightedFiles && node.status === 'covered' && 'text-foreground',
            !highlightedFiles && node.status === 'ignored' && 'opacity-40',
            folderUncovered && 'text-yellow-500',
            folderDimmed && 'opacity-30',
          )}
        >
          {node.children
            ? renderNodes({
                nodes: node.children,
                highlightedFiles,
                uncoveredFiles,
                configuredPaths,
                sortOrder,
              })
            : null}
        </Folder>
      );
    }

    const isHighlighted = highlightedFiles?.has(node.id);
    const isUncovered = uncoveredFiles?.has(node.id);
    const isDimmed = highlightedFiles && !isHighlighted && !isUncovered;

    return (
      <File
        key={node.id}
        value={node.id}
        fileIcon={<StatusIcon status={isUncovered ? 'orphan' : node.status} />}
        className={cn(
          isHighlighted && 'rounded-md bg-primary/10 font-medium',
          isUncovered && 'text-yellow-500',
          !highlightedFiles && node.status === 'covered' && 'text-foreground',
          !highlightedFiles && node.status === 'ignored' && 'opacity-40',
          isDimmed && 'opacity-30',
        )}
      >
        <span className="truncate">{node.name}</span>
      </File>
    );
  });
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
