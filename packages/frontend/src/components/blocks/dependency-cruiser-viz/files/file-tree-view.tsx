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
  featureSeedFiles: Set<string> | null;
  uncoveredFiles: Set<string> | null;
  configuredPaths: Set<string>;
  sortOrder: Map<string, number>;
  hoveredGraphFiles: Set<string> | null;
};

export function FileTreeView({
  tree,
  treeKey,
  expandedItems,
  highlightedFiles,
  featureSeedFiles,
  uncoveredFiles,
  configuredPaths,
  sortOrder,
  hoveredGraphFiles,
}: FileTreeViewProps) {
  return (
    <Tree
      key={hoveredGraphFiles ? `${treeKey}-hover` : treeKey}
      elements={tree as TreeViewElement[]}
      initialExpandedItems={expandedItems}
    >
      {renderNodes({
        nodes: tree,
        highlightedFiles,
        featureSeedFiles,
        uncoveredFiles,
        configuredPaths,
        sortOrder,
        hoveredGraphFiles,
      })}
    </Tree>
  );
}

function renderNodes({
  nodes,
  highlightedFiles,
  featureSeedFiles,
  uncoveredFiles,
  configuredPaths,
  sortOrder,
  hoveredGraphFiles,
}: {
  nodes: FileTreeNode[];
  highlightedFiles: Set<string> | null;
  featureSeedFiles: Set<string> | null;
  uncoveredFiles: Set<string> | null;
  configuredPaths: Set<string>;
  sortOrder: Map<string, number>;
  hoveredGraphFiles: Set<string> | null;
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
        uncoveredFiles && folderContainsAny(node, uncoveredFiles);
      const isConfigured = configuredPaths.has(node.id);
      const folderHoverDimmed =
        hoveredGraphFiles && !folderContainsAny(node, hoveredGraphFiles);

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
            folderHoverDimmed && 'opacity-20',
          )}
        >
          {node.children
            ? renderNodes({
                nodes: node.children,
                highlightedFiles,
                featureSeedFiles,
                uncoveredFiles,
                configuredPaths,
                sortOrder,
                hoveredGraphFiles,
              })
            : null}
        </Folder>
      );
    }

    const isHighlighted = highlightedFiles?.has(node.id);
    const isUncovered = uncoveredFiles?.has(node.id);
    const isDimmed = highlightedFiles && !isHighlighted && !isUncovered;
    const isSeed = featureSeedFiles?.has(node.id);
    const isGraphHovered = hoveredGraphFiles?.has(node.id);
    const isGraphDimmed = hoveredGraphFiles && !isGraphHovered;

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
          isGraphHovered &&
            'rounded-md bg-primary/20 font-semibold ring-1 ring-primary/30',
          isGraphDimmed && 'opacity-20',
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{node.name}</span>
        {isSeed ? (
          <span className="shrink-0 rounded-sm border border-primary/30 bg-primary/10 px-1 py-0.5 text-[10px] leading-none font-semibold text-primary uppercase">
            seed
          </span>
        ) : null}
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
