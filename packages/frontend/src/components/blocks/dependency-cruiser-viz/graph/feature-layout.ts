import { graphlib, layout } from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';
import { MarkerType, Position } from '@xyflow/react';

import type { FeatureTree, TreeNode } from './feature-graph-data';
import { collectAncestorIds } from './feature-graph-data';

export type FeatureNodeData = {
  kind: 'seed' | 'file' | 'folder';
  label: string;
  fullPath: string;
  files?: string[];
  layers: string[];
  isDimmed: boolean;
  isHovered: boolean;
  isExpanded?: boolean;
};

const SEED_NODE_WIDTH = 200;
const FILE_NODE_WIDTH = 180;
const FOLDER_NODE_WIDTH = 180;
const NODE_HEIGHT = 44;
const EDGE_COLOR = '#64748b';
const HIGHLIGHT_COLOR = '#3b82f6';

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

function folderName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] ?? path;
}

function nodeWidth(kind: string): number {
  return kind === 'seed'
    ? SEED_NODE_WIDTH
    : kind === 'folder'
      ? FOLDER_NODE_WIDTH
      : FILE_NODE_WIDTH;
}

export function computeFeatureLayout(
  tree: FeatureTree,
  hoveredNode: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const g = new graphlib.Graph();
  g.setGraph({
    rankdir: 'TB',
    nodesep: 30,
    ranksep: 60,
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const allNodes: TreeNode[] = [];
  const allEdges: Array<{
    parentId: string;
    childId: string;
    child: TreeNode;
  }> = [];

  function collectNodes(node: TreeNode, parentId: string | null) {
    allNodes.push(node);
    g.setNode(node.id, {
      width: nodeWidth(node.kind),
      height: NODE_HEIGHT,
    });

    if (parentId) {
      allEdges.push({ parentId, childId: node.id, child: node });
      g.setEdge(parentId, node.id);
    }

    for (const child of node.children) {
      collectNodes(child, node.id);
    }
  }

  for (const root of tree.roots) {
    collectNodes(root, null);
  }

  layout(g);

  const upstreamSet = hoveredNode
    ? collectAncestorIds(tree, hoveredNode)
    : null;

  const nodes: Node[] = allNodes.map((treeNode) => {
    const pos = g.node(treeNode.id);
    const w = nodeWidth(treeNode.kind);
    const isDimmed = upstreamSet !== null && !upstreamSet.has(treeNode.id);
    const isHovered = hoveredNode === treeNode.id;

    const data: FeatureNodeData = {
      kind: treeNode.kind,
      label:
        treeNode.kind === 'folder'
          ? folderName(treeNode.file)
          : basename(treeNode.file),
      fullPath: treeNode.file,
      layers: treeNode.layers,
      isDimmed,
      isHovered,
      ...(treeNode.kind === 'folder'
        ? { files: treeNode.files, isExpanded: treeNode.children.length > 0 }
        : {}),
    };

    return {
      id: treeNode.id,
      type: `feature-${treeNode.kind}`,
      position: { x: pos.x - w / 2, y: pos.y - NODE_HEIGHT / 2 },
      width: w,
      height: NODE_HEIGHT,
      data,
      handles: [
        { type: 'target' as const, position: Position.Top, x: w / 2, y: 0 },
        {
          type: 'source' as const,
          position: Position.Bottom,
          x: w / 2,
          y: NODE_HEIGHT,
        },
      ],
    };
  });

  const edges: Edge[] = allEdges.map(({ parentId, childId, child }) => {
    const edgeId = `${parentId}->${childId}`;
    const isOnPath =
      upstreamSet !== null &&
      upstreamSet.has(parentId) &&
      upstreamSet.has(childId);
    const isDimmed = upstreamSet !== null && !isOnPath;
    const isTypeOnly = child.runtimeCount === 0 && child.typeOnlyCount > 0;
    const totalCount = child.runtimeCount + child.typeOnlyCount;

    const color = isOnPath ? HIGHLIGHT_COLOR : EDGE_COLOR;

    let label: string | undefined;
    if (totalCount > 1) {
      const parts: string[] = [];
      if (child.runtimeCount > 0) parts.push(`${child.runtimeCount} runtime`);
      if (child.typeOnlyCount > 0) parts.push(`${child.typeOnlyCount} type`);
      label = parts.join(', ');
    }

    return {
      id: edgeId,
      source: parentId,
      target: childId,
      type: 'smoothstep',
      selectable: false,
      focusable: false,
      interactionWidth: 0,
      label,
      labelStyle: { fontSize: 10, fill: isDimmed ? '#94a3b8' : '#64748b' },
      labelBgStyle: { fill: 'hsl(var(--background))', fillOpacity: 0.8 },
      labelBgPadding: [4, 2] as [number, number],
      ...(isOnPath ? { zIndex: 10 } : {}),
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color,
      },
      style: {
        stroke: color,
        strokeWidth: isOnPath ? 2.5 : 1.5,
        ...(isTypeOnly ? { strokeDasharray: '6 3' } : {}),
        opacity: isDimmed ? 0.15 : 1,
        pointerEvents: 'none' as const,
      },
    };
  });

  return { nodes, edges };
}
