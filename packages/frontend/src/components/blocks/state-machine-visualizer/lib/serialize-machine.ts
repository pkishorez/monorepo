import { toDirectedGraph, type DirectedGraphNode } from 'xstate/graph';
import type { AnyStateMachine } from 'xstate';

import type {
  SerializedStateMachine,
  SerializedStateMachineEdge,
  SerializedStateMachineNode,
} from '../types';

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTransitionLabel(value: string): string {
  return value.startsWith('xstate.done.') ? 'Done' : value;
}

function isInitialNode(node: DirectedGraphNode): boolean {
  const initialTargets = node.stateNode.parent?.initial.target ?? [];
  return initialTargets.some((target) => target.id === node.id);
}

function serializeNode(
  graphNode: DirectedGraphNode,
  parentId: string | undefined,
  nodes: SerializedStateMachineNode[],
  edges: SerializedStateMachineEdge[],
): void {
  nodes.push({
    id: graphNode.id,
    label: humanize(graphNode.stateNode.key),
    description: graphNode.stateNode.description,
    type: graphNode.stateNode.type,
    parentId,
    initial: isInitialNode(graphNode),
  });

  for (const edge of graphNode.edges) {
    edges.push({
      id: edge.id,
      source: edge.source.id,
      target: edge.target.id,
      label: formatTransitionLabel(edge.label.text),
    });
  }

  for (const child of graphNode.children) {
    serializeNode(child, graphNode.id, nodes, edges);
  }
}

export function serializeStateMachine(
  machine: AnyStateMachine,
): SerializedStateMachine {
  const graph = toDirectedGraph(machine);
  const nodes: SerializedStateMachineNode[] = [];
  const edges: SerializedStateMachineEdge[] = [];

  for (const child of graph.children) {
    serializeNode(child, undefined, nodes, edges);
  }

  return {
    id: graph.id,
    label: humanize(graph.stateNode.key),
    nodes,
    edges,
  };
}
