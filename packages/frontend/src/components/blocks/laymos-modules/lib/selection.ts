import type { LaymosModuleSelection } from '../types';
import { moduleEdgeKey, type ModuleGraphModel } from './model';

export type ConnectionDirection = 'incoming' | 'outgoing';

export interface ModuleGraphSelectionModel {
  readonly root: string | null;
  readonly visibleModules: ReadonlySet<string>;
  readonly visibleEdges: ReadonlySet<string>;
  readonly focusedModules: ReadonlySet<string>;
  readonly focusedEdges: ReadonlySet<string>;
  readonly directions: ReadonlyMap<string, ConnectionDirection>;
  readonly incomingCount: number;
  readonly outgoingCount: number;
  readonly maximumDepth: number;
}

export function getModuleVisualState(
  selection: ModuleGraphSelectionModel,
  path: string,
) {
  const selected = selection.root === path;
  const related = !selection.root || selection.visibleModules.has(path);
  const hoverFiltering = selection.focusedModules.size > 0;
  const focused = selection.focusedModules.has(path);
  return {
    selected,
    related: Boolean(selection.root && related),
    dimmed: Boolean(
      selection.root && (!related || (hoverFiltering && !focused)),
    ),
  };
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
      focusedModules: new Set(),
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

  const focusedModules = new Set<string>();
  const focusedEdges = new Set<string>();
  if (hoveredModule) {
    focusedModules.add(selection.path);
  }
  if (hoveredModule && visibleModules.has(hoveredModule)) {
    focusedModules.add(hoveredModule);
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
    focusedModules,
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

/**
 * Previews a Group's connectivity: its members plus the modules directly wired
 * to them, and every edge that crosses the Group's boundary. Internal edges are
 * omitted because a collapsed Group renders them inside itself. The root is a
 * non-module sentinel so members read as related rather than selected.
 */
export function getGroupHoverSelection(
  model: ModuleGraphModel,
  groupName: string,
): ModuleGraphSelectionModel {
  const group = model.groups.get(groupName);
  if (!group) {
    return {
      root: null,
      visibleModules: new Set(),
      visibleEdges: new Set(),
      focusedModules: new Set(),
      focusedEdges: new Set(),
      directions: new Map(),
      incomingCount: 0,
      outgoingCount: 0,
      maximumDepth: 0,
    };
  }

  const members = new Set(group.modulePaths);
  const visibleModules = new Set<string>(members);
  const visibleEdges = new Set<string>();
  const directions = new Map<string, ConnectionDirection>();
  let incomingCount = 0;
  let outgoingCount = 0;
  for (const edge of model.edges) {
    const fromInside = members.has(edge.from);
    const toInside = members.has(edge.to);
    if (fromInside === toInside) continue;
    const key = moduleEdgeKey(edge.from, edge.to);
    visibleEdges.add(key);
    visibleModules.add(edge.from);
    visibleModules.add(edge.to);
    if (fromInside) {
      directions.set(key, 'outgoing');
      outgoingCount += 1;
    } else {
      directions.set(key, 'incoming');
      incomingCount += 1;
    }
  }

  return {
    root: `\0group:${groupName}`,
    visibleModules,
    visibleEdges,
    focusedModules: new Set(),
    focusedEdges: new Set(),
    directions,
    incomingCount,
    outgoingCount,
    maximumDepth: 1,
  };
}
