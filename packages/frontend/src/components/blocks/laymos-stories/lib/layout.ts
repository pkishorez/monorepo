import dagre from '@dagrejs/dagre';
import { MarkerType, type Edge, type Node } from '@xyflow/react';

import type {
  ProgressiveStoryGraphModel,
  StoryGraphEdge,
  StoryGraphNode,
} from './model';

const NODE_WIDTH = 248;
const NODE_HEIGHT = 104;
const RANK_GAP = 76;
const NODE_GAP = 30;
const COMPACT_NODE_WIDTH = 264;

export interface StoryGraphLayoutOptions {
  readonly compact?: boolean;
}

export interface StoryFlowNodeData extends Record<string, unknown> {
  readonly graphNode: StoryGraphNode;
  readonly nested: boolean;
  readonly inline: boolean;
  readonly scopeDepth: number;
}

export interface StoryFlowLayout {
  readonly nodes: Node<StoryFlowNodeData>[];
  readonly edges: Edge[];
}

function toFlowEdge(edge: StoryGraphEdge): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 13,
      height: 13,
      color: 'var(--muted-foreground)',
    },
    data: {
      inactive: edge.inactive,
      summary: edge.summary === true,
    },
    style: {
      stroke: 'var(--muted-foreground)',
      strokeWidth: edge.inactive ? 1.2 : 1.8,
      strokeDasharray: edge.inactive || edge.summary ? '4 5' : undefined,
      opacity: edge.inactive ? 0.18 : edge.summary ? 0.55 : 0.82,
    },
  };
}

/** Lays out the folded Story graph without implying a canonical Scenario. */
export function layoutStoryGraph(
  model: ProgressiveStoryGraphModel,
  options: StoryGraphLayoutOptions = {},
): StoryFlowLayout {
  const { compact = false } = options;
  const nodeWidth = compact ? COMPACT_NODE_WIDTH : NODE_WIDTH;
  const dimensions = new Map(
    model.nodes.map((node) => [
      node.id,
      node.kind === 'arm'
        ? { width: 136, height: 34 }
        : node.block.kind === 'flow'
          ? { width: 220, height: 52 }
          : {
              width: nodeWidth,
              height: compact ? 68 : NODE_HEIGHT,
            },
    ]),
  );
  const inlineFlowIds = new Set(
    model.nodes.flatMap((node) =>
      node.kind === 'block' &&
      node.block.kind === 'flow' &&
      node.isFlowScope === true
        ? [node.id]
        : [],
    ),
  );
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({
    rankdir: 'TB',
    ranksep: RANK_GAP,
    nodesep: NODE_GAP,
    edgesep: 14,
    acyclicer: 'greedy',
    ranker: 'network-simplex',
    marginx: 20,
    marginy: 20,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of model.nodes) {
    if (inlineFlowIds.has(node.id)) continue;
    graph.setNode(node.id, dimensions.get(node.id));
  }
  for (const edge of model.edges) {
    graph.setEdge(edge.source, edge.target, {}, edge.id);
  }
  dagre.layout(graph);

  const nodes = model.nodes.map((graphNode) => {
    const position = graph.node(graphNode.id) as
      | { x: number; y: number }
      | undefined;
    const size = dimensions.get(graphNode.id)!;
    return {
      id: graphNode.id,
      type: 'story-block',
      position: {
        x: (position?.x ?? 0) - size.width / 2,
        y: (position?.y ?? 0) - size.height / 2,
      },
      width: size.width,
      height: size.height,
      zIndex: graphNode.kind === 'arm' ? 11 : 10,
      data: { graphNode, nested: false, inline: false, scopeDepth: 0 },
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const graphNodeById = new Map(model.nodes.map((node) => [node.id, node]));
  const parentsByChild = new Map<string, string[]>();
  for (const [parentId, children] of Object.entries(model.childrenByNode)) {
    for (const childId of children) {
      const parents = parentsByChild.get(childId) ?? [];
      parents.push(parentId);
      parentsByChild.set(childId, parents);
    }
  }
  const flowDepth = (nodeId: string, seen = new Set<string>()): number => {
    if (seen.has(nodeId)) return 0;
    const nextSeen = new Set(seen).add(nodeId);
    return Math.max(
      0,
      ...(parentsByChild.get(nodeId) ?? []).map((parentId) => {
        const parent = graphNodeById.get(parentId);
        return (
          flowDepth(parentId, nextSeen) +
          (parent?.kind === 'block' && parent.block.kind === 'flow' ? 1 : 0)
        );
      }),
    );
  };
  const resizing = new Set<string>();
  const resized = new Set<string>();
  const hiddenFlowScopeIds = new Set<string>();
  const resizeInlineFlow = (flowId: string, depth: number): void => {
    const flow = nodeById.get(flowId);
    const children = model.childrenByNode[flowId] ?? [];
    if (flow === undefined || resizing.has(flowId) || resized.has(flowId))
      return;
    if (children.length === 0) {
      const graphNode = graphNodeById.get(flowId);
      if (graphNode?.kind === 'block' && graphNode.isFlowScope === true) {
        hiddenFlowScopeIds.add(flowId);
      }
      resized.add(flowId);
      return;
    }
    resizing.add(flowId);
    for (const childId of children) {
      const child = graphNodeById.get(childId);
      if (child?.kind === 'block' && child.block.kind === 'flow') {
        resizeInlineFlow(childId, depth + 1);
      }
    }
    const contained = new Set<string>();
    const pending = [...children];
    while (pending.length > 0) {
      const childId = pending.pop()!;
      if (contained.has(childId)) continue;
      contained.add(childId);
      pending.push(...(model.childrenByNode[childId] ?? []));
      for (const node of model.nodes) {
        if (node.kind === 'arm' && node.decisionId === childId) {
          contained.add(node.id);
        }
      }
    }
    const childNodes = [...contained].flatMap((id) => {
      if (hiddenFlowScopeIds.has(id)) return [];
      const node = nodeById.get(id);
      return node === undefined ? [] : [node];
    });
    if (childNodes.length === 0) return;
    const operationCount = [...contained].filter((id) => {
      const node = graphNodeById.get(id);
      return node?.kind === 'block' && node.block.kind !== 'flow';
    }).length;
    if (operationCount <= 1) {
      hiddenFlowScopeIds.add(flowId);
      resizing.delete(flowId);
      resized.add(flowId);
      return;
    }
    const left = Math.min(...childNodes.map((node) => node.position.x)) - 24;
    const right =
      Math.max(
        ...childNodes.map(
          (node) => node.position.x + (node.width ?? NODE_WIDTH),
        ),
      ) + 24;
    const top = Math.min(...childNodes.map((node) => node.position.y)) - 40;
    const bottom =
      Math.max(
        ...childNodes.map(
          (node) => node.position.y + (node.height ?? NODE_HEIGHT),
        ),
      ) + 24;
    flow.position = { x: left, y: top };
    flow.width = right - left;
    flow.height = bottom - top;
    flow.zIndex = -100 + Math.min(depth, 99);
    flow.data = { ...flow.data, inline: true, scopeDepth: depth };
    resizing.delete(flowId);
    resized.add(flowId);
  };
  for (const node of model.nodes) {
    if (node.kind === 'block' && node.block.kind === 'flow') {
      resizeInlineFlow(node.id, flowDepth(node.id));
    }
  }

  return {
    nodes: nodes.filter((node) => !hiddenFlowScopeIds.has(node.id)),
    edges: model.edges.map(toFlowEdge),
  };
}
