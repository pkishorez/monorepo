import type { LaymosModuleSelection } from '../types';
import { moduleEdgeKey, type ModuleGraphModel } from './model';

export type ConnectionDirection = 'incoming' | 'outgoing';

export interface ModuleGraphSelectionModel {
  readonly root: string | null;
  readonly visibleModules: ReadonlySet<string>;
  readonly visibleEdges: ReadonlySet<string>;
  readonly focusedEdges: ReadonlySet<string>;
  readonly directions: ReadonlyMap<string, ConnectionDirection>;
  readonly incomingCount: number;
  readonly outgoingCount: number;
  readonly maximumDepth: number;
}

function traverse(
  root: string,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): { nodes: Set<string>; distances: Map<string, number> } {
  const nodes = new Set([root]);
  const distances = new Map([[root, 0]]);
  const queue = [root];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    for (const next of adjacency.get(current) ?? []) {
      if (nodes.has(next)) continue;
      nodes.add(next);
      distances.set(next, distances.get(current)! + 1);
      queue.push(next);
    }
  }
  return { nodes, distances };
}

/** Computes direct or complete bidirectional disclosure for one module. */
export function getModuleGraphSelection(
  model: ModuleGraphModel,
  selection: LaymosModuleSelection | null,
  hoveredModule: string | null,
): ModuleGraphSelectionModel {
  if (!selection || !model.modules.has(selection.path)) {
    return {
      root: null,
      visibleModules: new Set(),
      visibleEdges: new Set(),
      focusedEdges: new Set(),
      directions: new Map(),
      incomingCount: 0,
      outgoingCount: 0,
      maximumDepth: 0,
    };
  }

  const outgoingAdjacency = model.successors;
  const incomingAdjacency = model.predecessors;
  const outgoing = traverse(selection.path, outgoingAdjacency);
  const incoming = traverse(selection.path, incomingAdjacency);
  const visibleModules = new Set<string>([selection.path]);
  const visibleEdges = new Set<string>();
  const directions = new Map<string, ConnectionDirection>();

  for (const edge of model.edges) {
    const key = moduleEdgeKey(edge.from, edge.to);
    const outgoingEdge =
      selection.depth === 'direct'
        ? edge.from === selection.path
        : outgoing.nodes.has(edge.from) && outgoing.nodes.has(edge.to);
    const incomingEdge =
      selection.depth === 'direct'
        ? edge.to === selection.path
        : incoming.nodes.has(edge.from) && incoming.nodes.has(edge.to);
    if (!outgoingEdge && !incomingEdge) continue;
    visibleEdges.add(key);
    visibleModules.add(edge.from);
    visibleModules.add(edge.to);
    directions.set(key, outgoingEdge ? 'outgoing' : 'incoming');
  }

  const focusedEdges = new Set<string>();
  if (hoveredModule && visibleModules.has(hoveredModule)) {
    for (const key of visibleEdges) {
      const edge = model.edgeByKey.get(key)!;
      if (edge.from === hoveredModule || edge.to === hoveredModule) {
        focusedEdges.add(key);
      }
    }
  }

  const maximumDepth = Math.max(
    0,
    ...outgoing.distances.values(),
    ...incoming.distances.values(),
  );
  return {
    root: selection.path,
    visibleModules,
    visibleEdges,
    focusedEdges,
    directions,
    incomingCount:
      selection.depth === 'direct'
        ? (incomingAdjacency.get(selection.path)?.size ?? 0)
        : incoming.nodes.size - 1,
    outgoingCount:
      selection.depth === 'direct'
        ? (outgoingAdjacency.get(selection.path)?.size ?? 0)
        : outgoing.nodes.size - 1,
    maximumDepth,
  };
}
