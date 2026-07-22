import dagre from '@dagrejs/dagre';
import { MarkerType, type Edge, type Node } from '@xyflow/react';

import type { StoryGraphEdge, StoryGraphModel, StoryGraphNode } from './model';

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
      color: edge.inactive ? 'var(--muted-foreground)' : 'var(--primary)',
    },
    data: { inactive: edge.inactive, summary: edge.summary === true },
    style: {
      stroke: edge.inactive ? 'var(--muted-foreground)' : 'var(--primary)',
      strokeWidth: edge.inactive ? 1.2 : 1.8,
      strokeDasharray: edge.inactive || edge.summary ? '4 5' : undefined,
      opacity: edge.inactive ? 0.18 : edge.summary ? 0.55 : 0.82,
    },
  };
}

/** Lays out the folded Story graph without implying a canonical Scenario. */
export function layoutStoryGraph(
  model: StoryGraphModel,
  options: StoryGraphLayoutOptions = {},
): StoryFlowLayout {
  const { compact = false } = options;
  const nodeWidth = compact ? COMPACT_NODE_WIDTH : NODE_WIDTH;
  const dimensions = new Map(
    model.nodes.map((node) => [
      node.id,
      node.kind === 'arm'
        ? { width: 136, height: 34 }
        : {
            width: nodeWidth,
            height: compact ? 68 : NODE_HEIGHT,
          },
    ]),
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
    graph.setNode(node.id, dimensions.get(node.id));
  }
  for (const edge of model.edges) {
    graph.setEdge(edge.source, edge.target, {}, edge.id);
  }
  dagre.layout(graph);

  return {
    nodes: model.nodes.map((graphNode) => {
      const position = graph.node(graphNode.id) as { x: number; y: number };
      const size = dimensions.get(graphNode.id)!;
      return {
        id: graphNode.id,
        type: 'story-block',
        position: {
          x: position.x - size.width / 2,
          y: position.y - size.height / 2,
        },
        width: size.width,
        height: size.height,
        data: { graphNode, nested: false },
      };
    }),
    edges: model.edges.map(toFlowEdge),
  };
}
